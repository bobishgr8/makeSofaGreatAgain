import { useState } from "react";
import { Link } from "react-router-dom";
import { useFormConfig, type FormConfig } from "../../app/FormConfigContext";
import Button from "../../common/components/Button";
import Card from "../../common/components/Card";

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: string;
  status: "Active" | "Banned";
};

type FurnitureRow = {
  id: number;
  title: string;
  owner: string;
  status: "Approved" | "Needs review";
  condition: string;
};

const initialUsers: UserRow[] = [
  {
    id: 1,
    name: "Amrita Tan",
    email: "amrita@example.com",
    role: "Social worker",
    status: "Active",
  },
  {
    id: 2,
    name: "Noah Lim",
    email: "noah@example.com",
    role: "Donor",
    status: "Active",
  },
  {
    id: 3,
    name: "Priya Suresh",
    email: "priya@example.com",
    role: "Social worker",
    status: "Banned",
  },
];

const initialFurniture: FurnitureRow[] = [
  {
    id: 1,
    title: "Oak dining table",
    owner: "Mina",
    status: "Approved",
    condition: "Good",
  },
  {
    id: 2,
    title: "Three-seater sofa",
    owner: "Caleb",
    status: "Needs review",
    condition: "Fair",
  },
  {
    id: 3,
    title: "Bookshelf",
    owner: "Siti",
    status: "Approved",
    condition: "Excellent",
  },
];

const formFields: Array<keyof FormConfig> = [
  "category",
  "subcategory",
  "title",
  "condition",
  "conditionNotes",
  "quantity",
  "widthCm",
  "depthCm",
  "heightCm",
  "neighbourhood",
  "floor",
  "hasLift",
  "fitsInLift",
  "disassembly",
  "delivery",
  "deadlineType",
  "collectionDeadline",
  "availability",
  "contactName",
  "whatsapp",
  "safeToUse",
  "offeredFree",
  "contactConsent",
  "photos",
];

const fieldLabels: Record<keyof FormConfig, string> = {
  category: "Category",
  subcategory: "Type or subtype",
  title: "Listing title",
  condition: "Condition",
  conditionNotes: "Condition note",
  quantity: "Quantity",
  widthCm: "Width",
  depthCm: "Depth",
  heightCm: "Height",
  neighbourhood: "Neighbourhood",
  floor: "Floor",
  hasLift: "Lift available",
  fitsInLift: "Fits in lift",
  disassembly: "Dismantling",
  delivery: "Delivery support",
  deadlineType: "Deadline type",
  collectionDeadline: "Collection date",
  availability: "Availability times",
  contactName: "Contact name",
  whatsapp: "WhatsApp number",
  safeToUse: "Safe to use",
  offeredFree: "Offered free",
  contactConsent: "Contact consent",
  photos: "Photos",
};

export default function AdminDashboard() {
  const { config, toggleField } = useFormConfig();
  const [users, setUsers] = useState(initialUsers);
  const [furniture, setFurniture] = useState(initialFurniture);

  function toggleUserStatus(id: number) {
    setUsers((current) =>
      current.map((user) =>
        user.id === id
          ? { ...user, status: user.status === "Active" ? "Banned" : "Active" }
          : user,
      ),
    );
  }

  function toggleFurnitureStatus(id: number) {
    setFurniture((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              status: item.status === "Approved" ? "Needs review" : "Approved",
            }
          : item,
      ),
    );
  }

  const activeUsers = users.filter((user) => user.status === "Active").length;
  const pendingFurniture = furniture.filter(
    (item) => item.status === "Needs review",
  ).length;

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <h1>Admin console.</h1>
          <p>
            Oversee the platform, manage account access, and review furniture
            before it goes live.
          </p>
        </div>
        <div className="actions">
          <Link className="button secondary" to="/furniture">
            Review furniture
          </Link>
        </div>
      </div>

      <div className="grid">
        <Card className="metric">
          <span>Active users</span>
          <strong>{activeUsers}</strong>
          <small>Accounts with access to the platform.</small>
        </Card>
        <Card className="metric">
          <span>Pending review</span>
          <strong>{pendingFurniture}</strong>
          <small>Furniture listings flagged for attention.</small>
        </Card>
        <Card className="metric">
          <span>Platform health</span>
          <strong>Green</strong>
          <small>Everything is running normally.</small>
        </Card>
      </div>

      <div className="admin-grid">
        <Card className="admin-panel">
          <div className="admin-panel-header">
            <h2>Form experience</h2>
            <span className="pill">Live configuration</span>
          </div>
          <p>
            Enable or hide form questions for donors at runtime. Changes are
            stored locally in your browser.
          </p>
          <div className="form-toggle-list">
            {formFields.map((field) => (
              <div className="field-toggle" key={field}>
                <span>{fieldLabels[field]}</span>
                <Button
                  type="button"
                  className={config[field] ? "" : "secondary"}
                  onClick={() => toggleField(field)}
                >
                  {config[field] ? "Shown" : "Hidden"}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="admin-grid">
        <Card className="admin-panel">
          <div className="admin-panel-header">
            <h2>Users</h2>
            <span className="pill">{users.length} total</span>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.name}</strong>
                    <div className="muted-text">{user.email}</div>
                  </td>
                  <td>{user.role}</td>
                  <td>
                    <span
                      className={`pill ${user.status === "Banned" ? "pill-danger" : "pill-success"}`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td>
                    <Button
                      type="button"
                      className="secondary"
                      onClick={() => toggleUserStatus(user.id)}
                    >
                      {user.status === "Active" ? "Ban user" : "Unban user"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="admin-panel">
          <div className="admin-panel-header">
            <h2>Furniture</h2>
            <span className="pill">{furniture.length} listed</span>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {furniture.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.title}</strong>
                    <div className="muted-text">{item.condition}</div>
                  </td>
                  <td>{item.owner}</td>
                  <td>
                    <span
                      className={`pill ${item.status === "Needs review" ? "pill-danger" : "pill-success"}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td>
                    <Button
                      type="button"
                      className="secondary"
                      onClick={() => toggleFurnitureStatus(item.id)}
                    >
                      {item.status === "Approved"
                        ? "Flag for review"
                        : "Approve"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </main>
  );
}
