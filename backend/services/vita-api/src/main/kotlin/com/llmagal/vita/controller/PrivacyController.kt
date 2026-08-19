package com.llmagal.vita.controller

import org.springframework.core.io.ClassPathResource
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

/**
 * BE-055 — the public privacy policy page. Store listings and the account screen
 * need a public URL; no domain is being bought, so it is served from this API at
 * `<publicBaseUrl>/v1/privacy` (the `/v1/auth/link` pattern). Static HTML, no
 * auth, no parameters, no state. Content is v0, pending CEO copy.
 */
@RestController
class PrivacyController {
    // ponytail: read once at startup — the file is a few KB and never changes at runtime.
    private val page = ClassPathResource("privacy.html").inputStream.use { it.readBytes().decodeToString() }

    @GetMapping("/v1/privacy", produces = [MediaType.TEXT_HTML_VALUE])
    fun privacy(): String = page
}
