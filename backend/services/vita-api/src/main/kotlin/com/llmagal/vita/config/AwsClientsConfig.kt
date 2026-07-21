package com.llmagal.vita.config

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.kms.KmsClient
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.S3Configuration
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import software.amazon.awssdk.services.ses.SesClient
import java.net.URI

/**
 * The single place that wires AWS SDK v2 clients. Active only under the `aws` profile
 * (BE-026/BE-027): the S3/KMS beans below select [com.llmagal.vita.service.uploads.S3FileStore]
 * and [com.llmagal.vita.service.crypto.KmsKeyWrapper] over the Local seams. Without the profile the
 * default context uses the Local beans and never constructs an AWS client — so `./gradlew check`
 * stays AWS-free (D9).
 *
 * Local-vs-prod is one property: `vita.aws.endpoint-override`. Set to `http://localhost:4566`
 * it points every client at LocalStack (dummy `test`/`test` creds, path-style S3); left blank
 * it uses real AWS endpoints and the default credentials provider (instance role in prod).
 */
@Configuration
@Profile("aws")
class AwsClientsConfig(
    @param:Value("\${vita.aws.region:eu-west-1}") region: String,
    @param:Value("\${vita.aws.endpoint-override:}") endpointOverride: String,
) {
    private val region = Region.of(region)
    private val endpoint: URI? = endpointOverride.ifBlank { null }?.let(URI::create)

    // LocalStack accepts any creds; prod uses the instance/task role.
    private val credentials: AwsCredentialsProvider =
        if (endpoint != null) {
            StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test"))
        } else {
            DefaultCredentialsProvider.create()
        }

    @Bean
    fun s3Client(): S3Client =
        S3Client
            .builder()
            .region(region)
            .credentialsProvider(credentials)
            .also { b -> endpoint?.let { b.endpointOverride(it).forcePathStyle(true) } }
            .build()

    @Bean
    fun s3Presigner(): S3Presigner =
        S3Presigner
            .builder()
            .region(region)
            .credentialsProvider(credentials)
            .also { b ->
                endpoint?.let {
                    b
                        .endpointOverride(it)
                        .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                }
            }.build()

    @Bean
    fun sesClient(): SesClient =
        SesClient
            .builder()
            .region(region)
            .credentialsProvider(credentials)
            .also { b -> endpoint?.let { b.endpointOverride(it) } }
            .build()

    @Bean
    fun kmsClient(): KmsClient =
        KmsClient
            .builder()
            .region(region)
            .credentialsProvider(credentials)
            .also { b -> endpoint?.let { b.endpointOverride(it) } }
            .build()
}
