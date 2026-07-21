package com.llmagal.vita.service.auth

import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO

private const val BLACK = 0xFF000000.toInt()
private const val WHITE = 0xFFFFFFFF.toInt()

/**
 * BE-034 — renders [text] as a PNG QR code. Uses only zxing-core (BitMatrix) plus the JDK's
 * ImageIO/BufferedImage, so we don't pull the zxing `javase` helper module (it does the same
 * ~10 lines). The magic-link email embeds this inline so the CEO can scan it from a desktop inbox.
 */
fun qrPng(
    text: String,
    size: Int = 360,
): ByteArray {
    val hints =
        mapOf(
            EncodeHintType.CHARACTER_SET to "UTF-8",
            EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
        )
    val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, hints)
    val image = BufferedImage(matrix.width, matrix.height, BufferedImage.TYPE_INT_RGB)
    for (y in 0 until matrix.height) {
        for (x in 0 until matrix.width) {
            image.setRGB(x, y, if (matrix.get(x, y)) BLACK else WHITE)
        }
    }
    return ByteArrayOutputStream().use { out ->
        ImageIO.write(image, "PNG", out)
        out.toByteArray()
    }
}
