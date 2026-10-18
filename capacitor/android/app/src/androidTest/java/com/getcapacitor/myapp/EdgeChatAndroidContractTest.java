package com.getcapacitor.myapp;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.aozorae.edgechat.web.MainActivity;
import com.aozorae.edgechat.web.nativebridge.EdgeChatNativePlugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class EdgeChatAndroidContractTest {
    private static final String APPLICATION_ID = "com.aozorae.edgechat.web";

    @Test
    public void appUsesProductionApplicationIdAndDeclaresAudioPermissions() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals(APPLICATION_ID, context.getPackageName());

        PackageInfo packageInfo = context.getPackageManager().getPackageInfo(
            context.getPackageName(),
            PackageManager.GET_PERMISSIONS
        );
        assertNotNull(packageInfo.requestedPermissions);
        assertTrue(Arrays.asList(packageInfo.requestedPermissions).contains(Manifest.permission.RECORD_AUDIO));
        assertTrue(Arrays.asList(packageInfo.requestedPermissions).contains(Manifest.permission.MODIFY_AUDIO_SETTINGS));
    }

    @Test
    public void nativePluginExposesMicrophoneRecoveryContract() throws Exception {
        CapacitorPlugin annotation = EdgeChatNativePlugin.class.getAnnotation(CapacitorPlugin.class);
        assertNotNull(annotation);
        assertEquals("EdgeChatNative", annotation.name());
        assertNotNull(EdgeChatNativePlugin.class.getMethod("requestMicrophonePermission", com.getcapacitor.PluginCall.class));
        assertNotNull(EdgeChatNativePlugin.class.getMethod("openAppSettings", com.getcapacitor.PluginCall.class));
    }

    @Test
    public void packagedConfigLeavesTextInputToTheSystemIme() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String config;
        try (
            BufferedReader reader = new BufferedReader(
                new InputStreamReader(
                    context.getAssets().open("capacitor.config.json"),
                    StandardCharsets.UTF_8
                )
            )
        ) {
            config = reader.lines().collect(Collectors.joining("\n"));
        }
        assertFalse(config.contains("\"captureInput\""));

        Intent intent = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Activity activity = InstrumentationRegistry.getInstrumentation().startActivitySync(intent);
        try {
            WebView webView = activity.findViewById(com.getcapacitor.android.R.id.webview);
            assertNotNull(webView);
            String focusResult = "\"missing\"";
            long deadline = System.currentTimeMillis() + 5_000;
            while (System.currentTimeMillis() < deadline && "\"missing\"".equals(focusResult)) {
                focusResult = evaluateJavascript(
                    webView,
                    "(() => { const field = document.querySelector('input, textarea');"
                        + " if (!field) return 'missing'; field.focus();"
                        + " return document.activeElement === field ? 'focused' : 'failed'; })()"
                );
                if ("\"missing\"".equals(focusResult)) Thread.sleep(100);
            }
            assertEquals("\"focused\"", focusResult);
        } finally {
            activity.finish();
        }
    }

    @Test
    public void webViewMicrophoneCanBeDeniedThenAllowed() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent intent = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Activity activity = InstrumentationRegistry.getInstrumentation().startActivitySync(intent);
        try {
            WebView webView = activity.findViewById(com.getcapacitor.android.R.id.webview);
            assertNotNull(webView);
            waitForJavascript(webView, "typeof Capacitor !== 'undefined'", "true", 5_000);

            evaluateJavascript(
                webView,
                "window.__micState = 'pending'; Capacitor.Plugins.EdgeChatNative"
                    + ".requestMicrophonePermission().then(r => window.__micState = r.state)"
            );
            clickPermissionButton("com.android.permissioncontroller:id/permission_deny_button");
            assertEquals(
                "\"prompt-with-rationale\"",
                waitForJavascript(webView, "window.__micState", "\"prompt-with-rationale\"", 5_000)
            );

            evaluateJavascript(
                webView,
                "window.__micState = 'pending'; Capacitor.Plugins.EdgeChatNative"
                    + ".requestMicrophonePermission().then(r => window.__micState = r.state)"
            );
            clickPermissionButton("com.android.permissioncontroller:id/permission_allow_foreground_only_button");
            assertEquals("\"granted\"", waitForJavascript(webView, "window.__micState", "\"granted\"", 5_000));

            evaluateJavascript(
                webView,
                "window.__mediaState = 'pending'; navigator.mediaDevices.getUserMedia({audio:true})"
                    + ".then(s => { window.__mediaState = s.getAudioTracks().length > 0 ? 'audio' : 'empty';"
                    + " s.getTracks().forEach(t => t.stop()); })"
                    + ".catch(e => window.__mediaState = 'error:' + e.name)"
            );
            assertEquals("\"audio\"", waitForJavascript(webView, "window.__mediaState", "\"audio\"", 8_000));
        } finally {
            activity.finish();
        }
    }

    private static void clickPermissionButton(String viewId) {
        long deadline = System.currentTimeMillis() + 5_000;
        while (System.currentTimeMillis() < deadline) {
            AccessibilityNodeInfo root = InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
            if (root != null) {
                java.util.List<AccessibilityNodeInfo> buttons = root.findAccessibilityNodeInfosByViewId(viewId);
                if (!buttons.isEmpty() && buttons.get(0).performAction(AccessibilityNodeInfo.ACTION_CLICK)) return;
            }
            SystemClock.sleep(100);
        }
        throw new AssertionError("系统权限按钮未出现: " + viewId);
    }

    private static String waitForJavascript(WebView webView, String script, String expected, long timeoutMillis)
        throws InterruptedException {
        String result = null;
        long deadline = System.currentTimeMillis() + timeoutMillis;
        while (System.currentTimeMillis() < deadline) {
            result = evaluateJavascript(webView, script);
            if (expected.equals(result)) return result;
            Thread.sleep(100);
        }
        return result;
    }

    private static String evaluateJavascript(WebView webView, String script) throws InterruptedException {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
            webView.evaluateJavascript(script, value -> {
                result.set(value);
                latch.countDown();
            })
        );
        assertTrue(latch.await(2, TimeUnit.SECONDS));
        return result.get();
    }
}
