import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
import Layout from "@/components/Layout";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Register = lazy(() => import("@/pages/Register"));
const Query = lazy(() => import("@/pages/Query"));
const Approval = lazy(() => import("@/pages/Approval"));

function PageLoader() {
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-gray-200 rounded-xl" />
          ))}
        </div>
        <div className="bg-white rounded-xl h-80 border border-gray-200">
          <div className="p-6">
            <div className="h-6 bg-gray-200 rounded w-32 mb-4" />
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-10 bg-gray-100 rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={
            <Suspense fallback={<PageLoader />}>
              <Dashboard />
            </Suspense>
          } />
          <Route path="/register" element={
            <Suspense fallback={<PageLoader />}>
              <Register />
            </Suspense>
          } />
          <Route path="/query" element={
            <Suspense fallback={<PageLoader />}>
              <Query />
            </Suspense>
          } />
          <Route path="/approval" element={
            <Suspense fallback={<PageLoader />}>
              <Approval />
            </Suspense>
          } />
        </Route>
      </Routes>
    </Router>
  );
}
