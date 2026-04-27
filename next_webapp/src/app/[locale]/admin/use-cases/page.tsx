"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Plus, Search, Filter } from "lucide-react";
import UseCaseTable from "./components/UseCaseTable";

function getAuthHeaders() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const userId = user.userId ?? user.id ?? "";
  const roleId = user.roleId ?? user.role_id ?? "";
  const token = user.token ?? "";
  return {
    "x-user-id": String(userId),
    "x-user-role-id": String(roleId),
    "x-user-role": user.roleName ?? user.role_name ?? "",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function UseCasesPage() {
  const { locale } = useParams() as { locale: string };

  const [usecases, setUsecases] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  useEffect(() => {
    const headers = getAuthHeaders();
    Promise.all([
      fetch("/api/usecases", { headers }).then((r) => r.json()),
      fetch("/api/categories", { headers }).then((r) => r.json()),
    ])
      .then(([ucJson, catJson]) => {
        if (ucJson.success) setUsecases(ucJson.data || []);
        else setError(ucJson.message || ucJson.error || "Failed to load use cases.");
        if (catJson.success) setCategories(catJson.data || []);
      })
      .catch(() => setError("Failed to load data."))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: number, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/usecases/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (!json.success) {
        alert(json.message || json.error || "Failed to delete use case.");
        return;
      }
      setUsecases((prev) => prev.filter((u) => u.id !== id));
    } catch {
      alert("Failed to delete use case.");
    }
  }

  const categoryMap = Object.fromEntries(
    categories.map((c) => [c.id, c.category_name])
  );

  const filtered = usecases
    .map((u) => ({ ...u, category_name: categoryMap[u.category_id] ?? "—" }))
    .filter((u) => {
      const matchSearch =
        u.title?.toLowerCase().includes(search.toLowerCase()) ||
        u.description?.toLowerCase().includes(search.toLowerCase());
      const matchCat =
        selectedCategory === "All" || String(u.category_id) === selectedCategory;
      return matchSearch && matchCat;
    });

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-[40px] font-semibold text-[#2DBE6C]">Use Cases</h1>
          <p className="mt-2 text-[16px] text-[#687280]">
            Manage and organize your use cases
          </p>
        </div>
        <Link
          href={`/${locale}/admin/use-cases/add`}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1F8F50] px-5 py-3 text-[14px] font-medium text-white transition hover:bg-[#2DBE6C]"
        >
          <Plus size={18} />
          Add New
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Search + Filter */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-[#CFEFD9] bg-[#F8FFFA] px-4 py-3">
          <Search size={18} className="text-[#1F8F50]" />
          <input
            placeholder="Search use cases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[#CFEFD9] bg-[#F8FFFA] px-4 py-3">
          <Filter size={18} className="text-[#1F8F50]" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-transparent text-sm outline-none"
          >
            <option value="All">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.category_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <UseCaseTable
        data={filtered}
        loading={loading}
        locale={locale}
        onDelete={handleDelete}
      />
    </div>
  );
}
