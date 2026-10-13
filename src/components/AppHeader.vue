<script setup>
defineProps({ user: Object, available: Boolean, menuOpen: Boolean });
defineEmits(["toggle-menu", "login", "logout", "my-reviews"]);
</script>
<template>
  <header>
    <button
      id="menuToggle"
      class="secondary mobile-menu-toggle"
      type="button"
      aria-controls="exploreMenu"
      :aria-expanded="menuOpen"
      :aria-label="menuOpen ? 'Cerrar menú' : 'Abrir menú'"
      @click="$emit('toggle-menu')"
    >
      <svg
        aria-hidden="true"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
    <div class="brand" :inert="menuOpen">
      <img
        src="/brand/logo.svg"
        alt="Quinto y Parque"
        width="285"
        height="100"
        class="brand-logo"
      />
      <div class="brand-copy">
        <h1 class="sr-only">Quinto y Parque</h1>
        <p class="eyebrow">Valencia y alrededores</p>
        <p class="hero-title">
          Tu terraza favorita.<br /><span>Su parque ideal.</span>
        </p>
      </div>
    </div>
    <div class="toolbar" :inert="menuOpen">
      <span id="account" class="small" style="color: white">{{
        user?.displayName || ""
      }}</span
      ><button
        id="myReviews"
        class="secondary my-reviews-button"
        type="button"
        aria-label="Mis reseñas"
        :hidden="!user"
        @click="$emit('my-reviews')"
      >
        <span aria-hidden="true">★</span
        ><span class="my-reviews-label">Mis reseñas</span></button
      ><button
        id="login"
        class="secondary"
        aria-label="Acceder con Google"
        :hidden="!available || !!user"
        @click="$emit('login')"
      >
        Entrar</button
      ><button
        id="logout"
        class="secondary"
        :hidden="!user"
        @click="$emit('logout')"
      >
        Salir
      </button>
    </div>
  </header>
</template>
