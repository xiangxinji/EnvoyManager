import { createRouter, createWebHistory } from "vue-router";
import Dashboard from "./views/Dashboard.vue";
import Teams from "./views/Teams.vue";
import TeamDetail from "./views/TeamDetail.vue";
import TaskDetail from "./views/TaskDetail.vue";
import Users from "./views/Users.vue";
import Login from "./views/Login.vue";
import Settings from "./views/Settings.vue";
import Models from "./views/Models.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: Login, meta: { public: true } },
    { path: "/", component: Dashboard },
    { path: "/teams", component: Teams },
    { path: "/teams/:name", component: TeamDetail, props: true },
    { path: "/teams/:name/tasks/:id", component: TaskDetail, props: true },
    { path: "/users", component: Users },
    { path: "/models", component: Models },
    { path: "/settings", component: Settings },
  ],
});

router.beforeEach((to) => {
  if (to.meta.public) return true;
  if (!localStorage.getItem("admin_token")) return "/login";
  return true;
});

export default router;
