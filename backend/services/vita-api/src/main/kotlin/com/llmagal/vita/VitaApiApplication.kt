package com.llmagal.vita

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class VitaApiApplication

@Suppress("SpreadOperator") // canonical Spring Boot Kotlin entry point
fun main(args: Array<String>) {
    runApplication<VitaApiApplication>(*args)
}
