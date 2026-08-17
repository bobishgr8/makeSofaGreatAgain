import { Navigate, Route, Routes } from "react-router-dom";

import LoginPage from "../modules/auth/LoginPage";
import RegisterPage from "../modules/auth/RegisterPage";
import UnauthorizedPage from "../common/components/UnauthorisedPage";

import DonorDashboard from "../modules/donors/DonorDashboard";
import DonationPage from "../modules/donors/DonationPage";

import SocialWorkerDashboard from "../modules/socialWorkers/SocialWorkerDashboard";
import CaseForm from "../modules/socialWorkers/CaseForm";

import FurnitureList from "../modules/furniture/FurnitureList";
import FurnitureForm from "../modules/furniture/FurnitureForm";
import FurnitureDetailsPage from "../modules/furniture/FurnitureDetailsPage";

import MatchList from "../modules/matching/MatchList";

import AdminDashboard from "../modules/admin/AdminDashboard";

import ProtectedRoute from "./ProtectedRoute";

export function AppRouter() {
  return (
    <Routes>
      {/* Default */}
      <Route
        path="/"
        element={<Navigate to="/furniture" replace />}
      />

      {/* Public */}
      <Route
        path="/login"
        element={<LoginPage />}
      />

      <Route
        path="/register"
        element={<RegisterPage />}
      />

      <Route
        path="/unauthorized"
        element={<UnauthorizedPage />}
      />

      <Route
        path="/furniture"
        element={<FurnitureList />}
      />

      {/* Donor */}
      <Route
        path="/donor"
        element={
          <ProtectedRoute roles={["donor", "admin"]}>
            <DonorDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/donate"
        element={
          <ProtectedRoute roles={["donor", "admin"]}>
            <DonationPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/furniture/new"
        element={
          <ProtectedRoute roles={["donor", "admin"]}>
            <FurnitureForm />
          </ProtectedRoute>
        }
      />

      {/* Social worker */}
      <Route
        path="/workspace"
        element={
          <ProtectedRoute
            roles={["social_worker", "admin"]}
            requireApproval
          >
            <SocialWorkerDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/cases/new"
        element={
          <ProtectedRoute
            roles={["social_worker", "admin"]}
            requireApproval
          >
            <CaseForm />
          </ProtectedRoute>
        }
      />

      <Route
        path="/matches"
        element={
          <ProtectedRoute
            roles={["social_worker", "admin"]}
            requireApproval
          >
            <MatchList />
          </ProtectedRoute>
        }
      />

      <Route
        path="/furniture/:id"
        element={<FurnitureDetailsPage />}
      />

      {/* Admin */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={["admin"]}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  );
}