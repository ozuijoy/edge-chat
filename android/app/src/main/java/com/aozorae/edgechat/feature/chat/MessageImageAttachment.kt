package com.aozorae.edgechat.feature.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.SubcomposeAsyncImage
import com.aozorae.edgechat.ui.theme.LocalEdgeChatColors

internal fun isImageAttachment(contentType: String?): Boolean = contentType?.startsWith("image/") == true

internal data class ImagePreviewSize(val width: Float, val height: Float)

internal fun fitImagePreview(aspectRatio: Float, maxWidth: Float, maxHeight: Float): ImagePreviewSize =
    if (aspectRatio >= maxWidth / maxHeight) {
        ImagePreviewSize(width = maxWidth, height = maxWidth / aspectRatio)
    } else {
        ImagePreviewSize(width = maxHeight * aspectRatio, height = maxHeight)
    }

@Composable
internal fun MessageImageAttachment(
    model: Any,
    name: String,
    language: String,
    tag: String,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val colors = LocalEdgeChatColors.current
    var aspectRatio by remember(model) { mutableStateOf<Float?>(null) }
    val clickModifier = if (onClick == null) {
        Modifier
    } else {
        Modifier.clickable(
            role = Role.Button,
            onClickLabel = if (language == "zh-CN") "打开图片" else "Open image",
            onClick = onClick,
        )
    }
    BoxWithConstraints(modifier) {
        val previewSize = aspectRatio?.let {
            fitImagePreview(
                aspectRatio = it,
                maxWidth = minOf(maxWidth, 280.dp).value,
                maxHeight = 240f,
            )
        }
        val sizeModifier = previewSize?.let { Modifier.size(it.width.dp, it.height.dp) }
            ?: Modifier.size(width = 140.dp, height = 96.dp)
        SubcomposeAsyncImage(
            model = model,
            contentDescription = name,
            modifier = sizeModifier
                .clip(RoundedCornerShape(8.dp))
                .then(clickModifier)
                .testTag(tag),
            contentScale = ContentScale.Fit,
            onSuccess = { state ->
                val size = state.painter.intrinsicSize
                if (size.width > 0f && size.height > 0f) aspectRatio = size.width / size.height
            },
            loading = {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp)
                }
            },
            error = {
                Column(
                    modifier = Modifier.fillMaxSize().padding(12.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Icon(
                        Icons.Outlined.Image,
                        contentDescription = null,
                        modifier = Modifier.size(28.dp),
                        tint = colors.iconSecondary,
                    )
                    Text(
                        text = name,
                        modifier = Modifier.padding(top = 6.dp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.textSecondary,
                    )
                }
            },
        )
    }
}
