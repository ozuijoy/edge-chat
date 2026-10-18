package com.aozorae.edgechat.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.aozorae.edgechat.ui.theme.LocalEdgeChatColors

@Composable
fun EdgeChatBrandMark(
    size: Dp,
    modifier: Modifier = Modifier,
) {
    val colors = LocalEdgeChatColors.current
    Box(
        modifier = modifier
            .size(size)
            .background(colors.subtleSecondary, RoundedCornerShape(size * 0.28f))
            .padding(size * 0.18f),
    ) {
        Canvas(Modifier.fillMaxSize()) {
            drawBubbleMark(
                foreground = colors.iconPrimary,
                accent = colors.accent,
            )
        }
    }
}

private fun DrawScope.drawBubbleMark(foreground: androidx.compose.ui.graphics.Color, accent: androidx.compose.ui.graphics.Color) {
    val scale = size.minDimension / 100f
    translate(left = (size.width - 100f * scale) / 2f, top = (size.height - 100f * scale) / 2f) {
        drawRoundRect(
            color = foreground,
            topLeft = Offset(5f * scale, 12f * scale),
            size = Size(73f * scale, 50f * scale),
            cornerRadius = CornerRadius(18f * scale),
        )
        drawPath(
            path = Path().apply {
                moveTo(23f * scale, 57f * scale)
                lineTo(31f * scale, 75f * scale)
                lineTo(43f * scale, 59f * scale)
                close()
            },
            color = foreground,
        )
        drawRoundRect(
            color = accent,
            topLeft = Offset(35f * scale, 43f * scale),
            size = Size(60f * scale, 39f * scale),
            cornerRadius = CornerRadius(15f * scale),
        )
        drawPath(
            path = Path().apply {
                moveTo(65f * scale, 77f * scale)
                lineTo(74f * scale, 92f * scale)
                lineTo(82f * scale, 78f * scale)
                close()
            },
            color = accent,
        )
    }
}
