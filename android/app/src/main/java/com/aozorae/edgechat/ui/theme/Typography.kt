package com.aozorae.edgechat.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.unit.sp

private val EdgeChatFont = FontFamily.SansSerif

val EdgeChatTypography = Typography(
    displaySmall = edgeTextStyle(FontWeight.Bold, 34, 41),
    headlineSmall = edgeTextStyle(FontWeight.Bold, 28, 34),
    titleLarge = edgeTextStyle(FontWeight.Bold, 22, 27),
    titleMedium = edgeTextStyle(FontWeight.SemiBold, 20, 25),
    titleSmall = edgeTextStyle(FontWeight.Medium, 16, 22),
    bodyLarge = edgeTextStyle(FontWeight.Normal, 16, 22),
    bodyMedium = edgeTextStyle(FontWeight.Normal, 14, 20),
    bodySmall = edgeTextStyle(FontWeight.Normal, 12, 17),
    labelLarge = edgeTextStyle(FontWeight.SemiBold, 14, 20),
    labelMedium = edgeTextStyle(FontWeight.Medium, 12, 17),
    labelSmall = edgeTextStyle(FontWeight.Medium, 11, 15),
)

private fun edgeTextStyle(weight: FontWeight, size: Int, lineHeight: Int) = TextStyle(
    fontFamily = EdgeChatFont,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = lineHeight.sp,
    letterSpacing = 0.sp,
    platformStyle = PlatformTextStyle(includeFontPadding = false),
    lineHeightStyle = LineHeightStyle(
        alignment = LineHeightStyle.Alignment.Center,
        trim = LineHeightStyle.Trim.None,
    ),
)
