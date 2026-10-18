package com.aozorae.edgechat.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat

private val LightColors = lightColorScheme(
    primary = LightEdgeChatColors.accent,
    onPrimary = LightEdgeChatColors.onAccent,
    primaryContainer = LightEdgeChatColors.accentSubtle,
    onPrimaryContainer = LightEdgeChatColors.onAccentSubtle,
    secondary = LightEdgeChatColors.textSecondary,
    onSecondary = LightEdgeChatColors.onAccent,
    secondaryContainer = LightEdgeChatColors.subtlePrimary,
    onSecondaryContainer = LightEdgeChatColors.textPrimary,
    tertiary = LightEdgeChatColors.accent,
    onTertiary = LightEdgeChatColors.onAccent,
    tertiaryContainer = LightEdgeChatColors.accentSubtle,
    onTertiaryContainer = LightEdgeChatColors.onAccentSubtle,
    background = LightEdgeChatColors.canvas,
    onBackground = LightEdgeChatColors.textPrimary,
    surface = LightEdgeChatColors.canvas,
    onSurface = LightEdgeChatColors.textPrimary,
    surfaceVariant = LightEdgeChatColors.subtleSecondary,
    onSurfaceVariant = LightEdgeChatColors.textSecondary,
    outline = LightEdgeChatColors.iconSecondary,
    outlineVariant = LightEdgeChatColors.separator,
    error = LightEdgeChatColors.critical,
    errorContainer = LightEdgeChatColors.criticalSubtle,
    onErrorContainer = LightEdgeChatColors.onCriticalSubtle,
)

private val DarkColors = darkColorScheme(
    primary = DarkEdgeChatColors.accent,
    onPrimary = DarkEdgeChatColors.onAccent,
    primaryContainer = DarkEdgeChatColors.accentSubtle,
    onPrimaryContainer = DarkEdgeChatColors.onAccentSubtle,
    secondary = DarkEdgeChatColors.textSecondary,
    onSecondary = DarkEdgeChatColors.onAccent,
    secondaryContainer = DarkEdgeChatColors.subtlePrimary,
    onSecondaryContainer = DarkEdgeChatColors.textPrimary,
    tertiary = DarkEdgeChatColors.accent,
    onTertiary = DarkEdgeChatColors.onAccent,
    tertiaryContainer = DarkEdgeChatColors.accentSubtle,
    onTertiaryContainer = DarkEdgeChatColors.onAccentSubtle,
    background = DarkEdgeChatColors.canvas,
    onBackground = DarkEdgeChatColors.textPrimary,
    surface = DarkEdgeChatColors.canvas,
    onSurface = DarkEdgeChatColors.textPrimary,
    surfaceVariant = DarkEdgeChatColors.subtleSecondary,
    onSurfaceVariant = DarkEdgeChatColors.textSecondary,
    outline = DarkEdgeChatColors.iconSecondary,
    outlineVariant = DarkEdgeChatColors.separator,
    error = DarkEdgeChatColors.critical,
    errorContainer = DarkEdgeChatColors.criticalSubtle,
    onErrorContainer = DarkEdgeChatColors.onCriticalSubtle,
)

private val EdgeChatShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(12.dp),
    extraLarge = RoundedCornerShape(20.dp),
)

@Composable
fun EdgeChatTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val semanticColors = if (dark) DarkEdgeChatColors else LightEdgeChatColors
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            // Compose 负责绘制系统栏背景，这里只同步图标明暗，避免深色模式仍显示浅色导航栏。
            val controller = WindowCompat.getInsetsController((view.context as Activity).window, view)
            controller.isAppearanceLightStatusBars = !dark
            controller.isAppearanceLightNavigationBars = !dark
        }
    }
    CompositionLocalProvider(LocalEdgeChatColors provides semanticColors) {
        MaterialTheme(
            colorScheme = if (dark) DarkColors else LightColors,
            typography = EdgeChatTypography,
            shapes = EdgeChatShapes,
            content = content,
        )
    }
}
