package com.llmagal.vita.users

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

/**
 * GET /v1/me — vertical proof for the walking skeleton: requires auth, so it
 * returns 401 (problem+json) until real JWT validation exists.
 */
@RestController
class MeController {
    @GetMapping("/v1/me")
    fun me(): Nothing {
        // ponytail: unreachable until JwtAuthFilter authenticates someone; real profile in BE-006.
        throw UnsupportedOperationException("Implemented in BE-006")
    }
}
