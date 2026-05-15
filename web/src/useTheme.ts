import { ref } from "vue";

type Theme = "light" | "dark";

const STORAGE_KEY = "envoy-theme";

function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return (stored === "light" || stored === "dark") ? stored : getSystemTheme();
}

const current = ref<Theme>(getInitialTheme());

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem(STORAGE_KEY, theme);
  current.value = theme;
}

export function useTheme() {
  apply(current.value);

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      apply(e.matches ? "dark" : "light");
    }
  });

  function toggle() {
    apply(current.value === "dark" ? "light" : "dark");
  }

  return { theme: current, toggle };
}
