import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import AudioVisual from "./pages/AudioVisual";
import Timeline from "./pages/Timeline";
import ParkOverview from "./pages/ParkOverview";
import ErrorBoundary from "./components/ErrorBoundary";
import { Toaster } from "react-hot-toast";
import StudioList from "./pages/studio/StudioList";
import CreateProject from "./pages/studio/CreateProject";
import ProjectDetail from "./pages/studio/ProjectDetail";
import ScriptPage from "./pages/studio/ScriptPage";
import Login from "./pages/studio/Login";
import StrategyPage from "./pages/studio/StrategyPage";
import ProtectedRoute from "./components/studio/ProtectedRoute";

const App = () => {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Layout>
          <Routes>
            <Route path="/" element={<ParkOverview />} />
            <Route path="/audiovisual" element={<AudioVisual />} />
            <Route path="/timeline" element={<Timeline />} />

            <Route path="/studio/login" element={<Login />} />
            <Route
              path="/studio"
              element={
                <ProtectedRoute>
                  <StudioList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/studio/new"
              element={
                <ProtectedRoute>
                  <CreateProject />
                </ProtectedRoute>
              }
            />
            <Route
              path="/studio/strategy"
              element={
                <ProtectedRoute>
                  <StrategyPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/studio/projects/:id"
              element={
                <ProtectedRoute>
                  <ProjectDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/studio/projects/:id/script"
              element={
                <ProtectedRoute>
                  <ScriptPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" toastOptions={{ duration: 3200 }} />
        </Layout>
      </ErrorBoundary>
    </BrowserRouter>
  );
};

export default App;
