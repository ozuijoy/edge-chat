package com.getcapacitor.myapp;

import static org.junit.Assert.assertEquals;

import com.aozorae.edgechat.web.MainActivity;
import org.junit.Test;

public class EdgeChatApplicationIdTest {
    @Test
    public void mainActivityUsesProductionPackage() {
        assertEquals("com.aozorae.edgechat.web", MainActivity.class.getPackageName());
    }
}
