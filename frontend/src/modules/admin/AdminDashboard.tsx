import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { auth } from "../../common/firebase";
import { useFormConfig, type FormConfig } from "../../app/FormConfigContext";
import Button from "../../common/components/Button";
import Card from "../../common/components/Card";

const API_URL = import.meta.env.VITE_API_URL;

type UserRow = {
  id: string;
  name: string;
  email: string;
  role?: string;
  approval?: string;
  disabled: boolean;
};

type FurnitureRow = {
  id: string;
  title: string;
  owner?: string;
  donorId?: string;
  status: "Approved" | "Needs review";
  condition?: string;
};

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

  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [furniture, setFurniture] = useState<FurnitureRow[]>([]);
  const [furnitureLoading, setFurnitureLoading] = useState(true);
  const [furnitureError, setFurnitureError] = useState<string | null>(null);

  async function getAuthHeaders() {
    const user = auth.currentUser;

    if (!user) {
      throw new Error("Not authenticated");
    }

    const token = await user.getIdToken();

    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  const loadUsers = useCallback(async () => {
    try {
      setUsersLoading(true);
      setUsersError(null);

      const headers = await getAuthHeaders();

      const response = await fetch(
        `${API_URL}/auth/users`,
        {
          headers,
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);

        throw new Error(
          body?.error ?? "Could not load users",
        );
      }

      const data: UserRow[] = await response.json();

      setUsers(data);
    } catch (error) {
      console.error("Failed to load users", error);

      setUsersError(
        "Couldn't load users. Try refreshing.",
      );
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadFurniture = useCallback(async () => {
    try {
      setFurnitureLoading(true);
      setFurnitureError(null);

      const headers = await getAuthHeaders();

      const response = await fetch(
        `${API_URL}/api/furniture/admin/all`,
        {
          headers,
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);

        throw new Error(
          body?.error ?? "Could not load furniture",
        );
      }

      const data: FurnitureRow[] = await response.json();

      setFurniture(data);
    } catch (error) {
      console.error(
        "Failed to load furniture",
        error,
      );

      setFurnitureError(
        "Couldn't load furniture listings. Try refreshing.",
      );
    } finally {
      setFurnitureLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
    void loadFurniture();
  }, [loadUsers, loadFurniture]);

  async function toggleUserStatus(user: UserRow) {
    const nextDisabled = !user.disabled;

    try {
      const headers = await getAuthHeaders();

      const response = await fetch(
        `${API_URL}/auth/users/${user.id}/status`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            disabled: nextDisabled,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);

        throw new Error(
          body?.error ?? "Could not update user",
        );
      }

      setUsers((current) =>
        current.map((item) =>
          item.id === user.id
            ? {
                ...item,
                disabled: nextDisabled,
              }
            : item,
        ),
      );
    } catch (error) {
      console.error(
        "Failed to update user status",
        error,
      );
    }
  }

  async function toggleFurnitureStatus(
    item: FurnitureRow,
  ) {
    const nextStatus =
      item.status === "Approved"
        ? "Needs review"
        : "Approved";

    try {
      const headers = await getAuthHeaders();

      const response = await fetch(
        `${API_URL}/api/furniture/admin/${item.id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            status: nextStatus,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);

        throw new Error(
          body?.error ?? "Could not update furniture",
        );
      }

      setFurniture((current) =>
        current.map((furnitureItem) =>
          furnitureItem.id === item.id
            ? {
                ...furnitureItem,
                status: nextStatus,
              }
            : furnitureItem,
        ),
      );
    } catch (error) {
      console.error(
        "Failed to update furniture status",
        error,
      );
    }
  }

  async function updateSocialWorkerApproval(
    user: UserRow,
    approval: "approved" | "rejected",
  ) {
    try {
      const headers = await getAuthHeaders();

      const response = await fetch(
        `${API_URL}/auth/social-workers/${user.id}/approval`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            approval,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);

        throw new Error(
          body?.error ??
            "Could not update social worker approval",
        );
      }

      setUsers((current) =>
        current.map((item) =>
          item.id === user.id
            ? {
                ...item,
                approval,
              }
            : item,
        ),
      );
    } catch (error) {
      console.error(
        "Failed to update social worker approval",
        error,
      );
    }
  }

  const activeUsers = users.filter(
    (user) => !user.disabled,
  ).length;

  const pendingSocialWorkers = users.filter(
    (user) =>
      user.role === "social_worker" &&
      user.approval === "pending",
  ).length;

  const pendingFurniture = furniture.filter(
    (item) => item.status === "Needs review",
  ).length;

  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <h1>Admin console.</h1>

          <p>
            Oversee the platform, manage account access,
            approve social workers, and review furniture
            before it goes live.
          </p>
        </div>

        <div className="actions">
          <Link
            className="button secondary"
            to="/furniture"
          >
            Review furniture
          </Link>
        </div>
      </div>

      <div className="grid">
        <Card className="metric">
          <span>Active users</span>
          <strong>{activeUsers}</strong>
          <small>
            Accounts currently enabled on the platform.
          </small>
        </Card>

        <Card className="metric">
          <span>Pending social workers</span>
          <strong>{pendingSocialWorkers}</strong>
          <small>
            Social worker accounts awaiting approval.
          </small>
        </Card>

        <Card className="metric">
          <span>Pending furniture</span>
          <strong>{pendingFurniture}</strong>
          <small>
            Furniture listings flagged for review.
          </small>
        </Card>
      </div>

      <Card className="admin-panel admin-panel-fullwidth">
        <div className="admin-panel-header">
          <h2>Form experience</h2>
          <span className="pill">
            Live configuration
          </span>
        </div>

        <p>
          Enable or hide form questions for donors at
          runtime. Changes are stored locally in your
          browser.
        </p>

        <div className="form-toggle-list form-toggle-list-fullwidth">
          {formFields.map((field) => (
            <div
              className="field-toggle"
              key={field}
            >
              <span>{fieldLabels[field]}</span>

              <Button
                type="button"
                className={
                  config[field]
                    ? ""
                    : "secondary"
                }
                onClick={() => toggleField(field)}
              >
                {config[field]
                  ? "Shown"
                  : "Hidden"}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <div className="admin-grid">
        <Card className="admin-panel">
          <div className="admin-panel-header">
            <h2>Users</h2>

            <span className="pill">
              {users.length} total
            </span>
          </div>

          {usersError && (
            <p className="error-text">
              {usersError}
            </p>
          )}

          {usersLoading ? (
            <p className="muted-text">
              Loading users...
            </p>
          ) : users.length === 0 ? (
            <p className="muted-text">
              No users yet.
            </p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Approval</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>
                        {user.name || "Unnamed user"}
                      </strong>

                      <div className="muted-text">
                        {user.email || "No email"}
                      </div>
                    </td>

                    <td>
                      {user.role ?? "Unassigned"}
                    </td>

                    <td>
                      {user.role ===
                      "social_worker" ? (
                        <>
                          <span
                            className={`pill ${
                              user.approval ===
                              "approved"
                                ? "pill-success"
                                : user.approval ===
                                    "rejected"
                                  ? "pill-danger"
                                  : ""
                            }`}
                          >
                            {user.approval ??
                              "pending"}
                          </span>

                          {user.approval !==
                            "approved" && (
                            <div className="actions">
                              <Button
                                type="button"
                                onClick={() =>
                                  updateSocialWorkerApproval(
                                    user,
                                    "approved",
                                  )
                                }
                              >
                                Approve
                              </Button>

                              <Button
                                type="button"
                                className="secondary"
                                onClick={() =>
                                  updateSocialWorkerApproval(
                                    user,
                                    "rejected",
                                  )
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="muted-text">
                          —
                        </span>
                      )}
                    </td>

                    <td>
                      <span
                        className={`pill ${
                          user.disabled
                            ? "pill-danger"
                            : "pill-success"
                        }`}
                      >
                        {user.disabled
                          ? "Banned"
                          : "Active"}
                      </span>
                    </td>

                    <td>
                      <Button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          toggleUserStatus(user)
                        }
                      >
                        {user.disabled
                          ? "Unban user"
                          : "Ban user"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="admin-panel admin-panel-fullwidth">
          <div className="admin-panel-header">
            <div>
              <h2>Furniture listings</h2>
              <p className="muted-text">
                Review submitted furniture and manage listing status.
              </p>
            </div>

            <span className="pill">
              {furniture.length} listed
            </span>
          </div>

          {furnitureError && (
            <p className="error-text">
              {furnitureError}
            </p>
          )}

          {furnitureLoading ? (
            <p className="muted-text">
              Loading furniture...
            </p>
          ) : furniture.length === 0 ? (
            <div className="empty-state">
              <h3>No furniture yet</h3>
              <p className="muted-text">
                Submitted furniture will appear here.
              </p>
            </div>
          ) : (
            <div className="admin-furniture-grid">
              {furniture.map((item) => (
                <article
                  className="admin-furniture-card"
                  key={item.id}
                >
                  <div className="admin-furniture-card-header">
                    <div>
                      <span className="muted-text">
                        {item.condition ?? "Condition unknown"}
                      </span>

                      <h3>{item.title || "Untitled furniture"}</h3>
                    </div>

                    <span
                      className={`pill ${
                        item.status === "Needs review"
                          ? "pill-danger"
                          : "pill-success"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <div className="admin-furniture-meta">
                    <div>
                      <span className="muted-text">
                        Owner
                      </span>

                      <strong>
                        {item.owner ??
                          item.donorId ??
                          "Unknown"}
                      </strong>
                    </div>

                    <div>
                      <span className="muted-text">
                        Listing ID
                      </span>

                      <strong className="admin-furniture-id">
                        {item.id}
                      </strong>
                    </div>
                  </div>

                  <div className="admin-furniture-actions">
                    <Button
                      type="button"
                      className={
                        item.status === "Approved"
                          ? "secondary"
                          : ""
                      }
                      onClick={() =>
                        toggleFurnitureStatus(item)
                      }
                    >
                      {item.status === "Approved"
                        ? "Flag for review"
                        : "Approve listing"}
                    </Button>

                    <Link
                      className="button secondary"
                      to={`/furniture/${item.id}`}
                    >
                      View listing
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}