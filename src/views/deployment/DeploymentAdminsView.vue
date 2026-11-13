<script setup lang="ts">
// The deployment admins, behind the area's door: a sign-in too old for the area is met
// first, so the recorded read of people is not made for it.
import AreaGate from './AreaGate.vue'
import DeploymentAdminsPage from './DeploymentAdminsPage.vue'
</script>

<template>
  <AreaGate><DeploymentAdminsPage /></AreaGate>
</template>
