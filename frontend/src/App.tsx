import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import AudioVisual from "./pages/AudioVisual";
import Timeline from "./pages/Timeline";
import ParkOverview from "./pages/ParkOverview";
import Login from "./pages/Login";
import Projects from "./pages/Projects";
import ProjectScript from "./pages/ProjectScript";
import CreateWizard from "./pages/create/CreateWizard";
import ErrorBoundary from "./components/ErrorBoundary";
import RequireAuth from "./components/RequireAuth";
import { Toaster } from "react-hot-toast";
import { useOutbox } from "./hooks/useOutbox";

const App = () => {
  // 离线发件箱：网络恢复后自动重放创建请求（幂等）
  useOutbox();

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Layout>
          <Routes>
            <Route path="/" element={<ParkOverview />} />
            <Route path="/audiovisual" element={<AudioVisual />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/create"
              element={
                <RequireAuth>
                  <CreateWizard />
                </RequireAuth>
              }
            />
            <Route
              path="/projects"
              element={
                <RequireAuth>
                  <Projects />
                </RequireAuth>
              }
            />
            <Route
              path="/projects/:id/script"
              element={
                <RequireAuth>
                  <ProjectScript />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" />
        </Layout>
      </ErrorBoundary>
    </BrowserRouter>
  );
};

export default App;
