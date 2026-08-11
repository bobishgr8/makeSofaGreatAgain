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

export function AppRouter() {
  return <Routes>
    <Route path="/" element={<Navigate to="/furniture" replace />} />
    <Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} />
    <Route path="/donor" element={<DonorDashboard />} /><Route path="/donate" element={<DonationPage />} />
    <Route path="/furniture" element={<FurnitureList />} /><Route path="/furniture/new" element={<FurnitureForm />} />
    <Route path="/workspace" element={<SocialWorkerDashboard />} /><Route path="/cases/new" element={<CaseForm />} />
    <Route path="/matches" element={<MatchList />} /><Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
