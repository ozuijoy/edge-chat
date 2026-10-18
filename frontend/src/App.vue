<script setup>
import { defineAsyncComponent } from 'vue';
import ChunkLoadNotice from './components/ChunkLoadNotice.vue';

const DemoNavigator = globalThis.__EDGECHAT_DEMO__
  ? defineAsyncComponent(() => import('./components/demo/DemoNavigator.vue'))
  : null;
</script>

<template>
  <router-view v-slot="{ Component, route }">
    <Transition :name="route.meta.transition || 'page'" mode="out-in">
      <component :is="Component" :key="route.meta.workspace ? 'workspace' : route.path" />
    </Transition>
  </router-view>
  <component :is="DemoNavigator" v-if="DemoNavigator" />
  <ChunkLoadNotice />
</template>

<style>
/* 页面切换 — 丝滑淡入淡出 */
.page-enter-active,
.page-leave-active {
  transition: opacity 240ms cubic-bezier(0.37, 0, 0.63, 1),
              transform 240ms cubic-bezier(0.37, 0, 0.63, 1);
}

.page-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
