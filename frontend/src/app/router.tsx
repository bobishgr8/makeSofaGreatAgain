import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "../modules/auth/LoginPage";
import RegisterPage from "../modules/auth/RegisterPage";
import DonorDashboard from "../modules/donors/DonorDashboard";
import DonationPage from "../modules/donors/DonationPage";
import SocialWorkerDashboard from "../modules/socialWorkers/SocialWorkerDashboard";
import CaseForm from "../modules/socialWorkers/CaseForm";
import FurnitureList from "../modules/furniture/FurnitureList";
import FurnitureForm from "../modules/furniture/FurnitureForm";
import MatchList from "../modules/matching/MatchList";
import AdminDashboard from "../modules/admin/AdminDashboard";
import ProtectedRoute from "./ProtectedRoute";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/furniture" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/donor" element={<ProtectedRoute roles={["donor","admin"]}><DonorDashboard /></ProtectedRoute>} />
      <Route path="/donate" element={<ProtectedRoute roles={["donor","admin"]}><DonationPage /></ProtectedRoute>} />
      <Route path="/furniture" element={<FurnitureList />} />
      <Route path="/furniture/new" element={<ProtectedRoute roles={["donor","admin"]}><FurnitureForm /></ProtectedRoute>} />
      <Route path="/workspace" element={<ProtectedRoute roles={["social_worker","admin"]}><SocialWorkerDashboard /></ProtectedRoute>} />
      <Route path="/cases/new" element={<ProtectedRoute roles={["social_worker","admin"]}><CaseForm /></ProtectedRoute>} />
      <Route path="/matches" element={<ProtectedRoute roles={["social_worker","admin"]}><MatchList /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><AdminDashboard /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
