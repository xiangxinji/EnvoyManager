import { createRouter, createWebHistory } from "vue-router";
import Dashboard from "./views/Dashboard.vue";
import Teams from "./views/Teams.vue";
import TeamDetail from "./views/TeamDetail.vue";
import TaskDetail from "./views/TaskDetail.vue";
import Users from "./views/Users.vue";
import Login from "./views/Login.vue";
import Settings from "./views/Settings.vue";
import Models from "./views/Models.vue";
import Glossary from "./views/Glossary.vue";
import Analytics from "./views/Analytics.vue";
import { getAdminToken, verifyAdminSession } from "./api";

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
    { path: "/glossary", component: Glossary },
    { path: "/analytics", component: Analytics },
    { path: "/settings", component: Settings },
  ],
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  if (!getAdminToken()) return "/login";
  if (!(await verifyAdminSession())) return "/login";
  return true;
});

export default router;
