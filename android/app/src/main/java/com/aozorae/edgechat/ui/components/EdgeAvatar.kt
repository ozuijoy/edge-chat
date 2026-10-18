package com.aozorae.edgechat.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import coil.compose.SubcomposeAsyncImage

@Composable
fun EdgeAvatar(
    imageUrl: String,
    displayName: String,
    modifier: Modifier = Modifier,
    borderColor: Color? = null,
) {
    val avatarModifier = modifier
        .clip(CircleShape)
        .then(
            if (borderColor == null) Modifier
            else Modifier.border(width = androidx.compose.ui.unit.Dp.Hairline, color = borderColor, shape = CircleShape),
        )

    SubcomposeAsyncImage(
        model = imageUrl.takeIf(String::isNotBlank),
        contentDescription = displayName,
        modifier = avatarModifier,
        contentScale = ContentScale.Crop,
        loading = { AvatarFallback(displayName) },
        error = { AvatarFallback(displayName) },
    )
}

@Composable
private fun AvatarFallback(displayName: String) {
    val dark = isSystemInDarkTheme()
    val palette = remember(displayName, dark) {
        val palettes = if (dark) DarkAvatarPalettes else LightAvatarPalettes
        palettes[(displayName.hashCode() and Int.MAX_VALUE) % palettes.size]
    }
    Box(
        modifier = Modifier.fillMaxSize().background(palette.background),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = displayName.trim().firstOrNull()?.uppercase() ?: "E",
            color = palette.foreground,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

private data class AvatarPalette(val background: Color, val foreground: Color)

private val LightAvatarPalettes = listOf(
    AvatarPalette(Color(0xFFFFE4E8), Color(0xFF9E174D)),
    AvatarPalette(Color(0xFFE9E5FF), Color(0xFF5E35C7)),
    AvatarPalette(Color(0xFFE3F7ED), Color(0xFF006B52)),
    AvatarPalette(Color(0xFFFFE8D9), Color(0xFF9A4300)),
    AvatarPalette(Color(0xFFE3F5F8), Color(0xFF00629C)),
)

private val DarkAvatarPalettes = listOf(
    AvatarPalette(Color(0xFF4C1730), Color(0xFFFFB7CF)),
    AvatarPalette(Color(0xFF332566), Color(0xFFD4C7FF)),
    AvatarPalette(Color(0xFF003D29), Color(0xFF72D5AE)),
    AvatarPalette(Color(0xFF522600), Color(0xFFFFC18B)),
    AvatarPalette(Color(0xFF003468), Color(0xFF78D0DC)),
)

fun resolveServerUrl(serverBaseUrl: String, path: String): String = when {
    path.isBlank() -> ""
    path.startsWith("https://") || path.startsWith("http://") -> path
    else -> "${serverBaseUrl.trimEnd('/')}/${path.trimStart('/')}"
}
