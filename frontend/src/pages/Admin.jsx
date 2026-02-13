import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function Admin() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/users`, { headers });
      if (!res.ok) throw new Error("Error al cargar usuarios");
      setUsers(await res.json());
    } catch (e) {
      setError(e.message);
    }
  }, [token]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleDelete = async (id, username) => {
    if (!confirm(`¿Eliminar al usuario "${username}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/admin/users/${id}`, { method: "DELETE", headers });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail);
      }
      fetchUsers();
    } catch (e) {
      alert(e.message);
    }
  };

  const startEdit = (user) => {
    setEditingId(user.id);
    setEditForm({ username: user.username, email: user.email, role: user.role });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleUpdate = async (id) => {
    const body = {};
    if (editForm.username) body.username = editForm.username;
    if (editForm.email) body.email = editForm.email;
    if (editForm.role) body.role = editForm.role;

    try {
      const res = await fetch(`${API_URL}/admin/users/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail);
      }
      setEditingId(null);
      fetchUsers();
    } catch (e) {
      alert(e.message);
    }
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h2>Gestión de Usuarios</h2>
      </div>

      {error && <p className="auth-error">{error}</p>}

      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Usuario</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Registro</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="admin-row-clickable" onClick={() => { if (editingId !== u.id && u.role !== "admin") navigate(`/admin/user/${u.id}`); }}>
                {editingId === u.id ? (
                  <>
                    <td>{u.id}</td>
                    <td>
                      <input
                        className="admin-edit-input"
                        value={editForm.username}
                        onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="admin-edit-input"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      />
                    </td>
                    <td>
                      {u.role === "admin" ? (
                        <select
                          className="admin-edit-input"
                          value={editForm.role}
                          onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      ) : (
                        <span className={`admin-role ${u.role}`}>{u.role}</span>
                      )}
                    </td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td className="admin-actions">
                      <button className="admin-btn admin-btn-save" onClick={() => handleUpdate(u.id)} title="Guardar">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                      </button>
                      <button className="admin-btn admin-btn-cancel" onClick={cancelEdit} title="Cancelar">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{u.id}</td>
                    <td>{u.username}</td>
                    <td>{u.email}</td>
                    <td><span className={`admin-role ${u.role}`}>{u.role}</span></td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td className="admin-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="admin-btn admin-btn-edit" onClick={() => startEdit(u)} title="Editar">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                        </svg>
                      </button>
                      <button className="admin-btn admin-btn-delete" onClick={() => handleDelete(u.id, u.username)} title="Eliminar">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
