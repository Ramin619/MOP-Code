import { NextResponse } from "next/server";
import { supabase } from "@/library/supabaseClient";
import {
    CreateCategoryDTO,
    validateCreateCategory,
    sanitizeCategoryInput,
} from "@/models/Category";
import { errorResponse } from "@/app/api/library/errorResponse";
import { getAuthUser } from "@/app/api/library/auth";
import { NextRequest } from "next/server";

// ==============================
// POST /api/categories
// Create Category (ADMIN ONLY)
// ==============================

export async function POST(request: NextRequest) {
    try {
        // ==============================
        // 1. Check Admin Authorization
        // ==============================
        const { userId, isAuthenticated, isAdmin } = getAuthUser(request);

        if (!isAuthenticated) {
            return errorResponse("User not authenticated", 401, "UNAUTHORIZED");
        }

        if (!isAdmin) {
            return errorResponse("Forbidden - Admin only", 403, "FORBIDDEN");
        }


        // ==============================
        // 2. Parse & Sanitize Input
        // ==============================
        const body: CreateCategoryDTO = await request.json();
        const cleanData = sanitizeCategoryInput(body);

        // ==============================
        // 3. Validate Input
        // ==============================
        const validationError = validateCreateCategory(cleanData);

        if (validationError) {
            return errorResponse(validationError, 400, "VALIDATION_ERROR");
        }

        const { category_name, description } = cleanData;

        // ==============================
        // 4. Check duplicate category
        // ==============================

        const { data: existingCategory, error: checkError } = await supabase
            .from("categories")
            .select("id")
            .ilike("category_name", category_name)
            .maybeSingle();

        if (checkError) {
            console.error("Duplicate Check Error:", checkError);
            return errorResponse(
                "Failed to validate category",
                500,
                "DB_CHECK_ERROR"
            );
        }

        if (existingCategory) {
            return errorResponse(
                "Category already exists",
                400,
                "DUPLICATE_CATEGORY"
            );
        }

        // ==============================
        // 5. Insert into Supabase
        // ==============================
        const { data, error } = await supabase
            .from("categories")
            .insert([
                {
                    category_name,
                    description: description ?? null,
                    created_by: Number(userId),
                },
            ])
            .select()
            .single();


        const { data: createdUser, error: userError } = await supabase
            .from("user")
            .select("id, email, role_id")
            .eq("id", data.created_by)
            .single();

        if (userError) {
            console.error("User fetch error:", userError);
        }

        if (error) {
            console.error("Supabase Insert Error:", error);
            return errorResponse(
                "Failed to create category",
                500,
                "DB_INSERT_ERROR"
            );
        }

        // ==============================
        // 5. Success Response
        // ==============================
        return NextResponse.json(
            {
                success: true,
                message: "Category created successfully",
                data: {
                    ...data,
                    created_by_user: createdUser || null,
                },
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("Create Category Error:", error);

        return errorResponse(
            "Internal Server Error",
            500,
            "INTERNAL_ERROR"
        );
    }
}

// ==============================
// GET /api/categories
// Fetch all categories (with optional search filter)
// ==============================
export async function GET(request: NextRequest) {
  try {
    // 1. Auth check
    const { userId } = getAuthUser(request);
    if (!userId) {
      return errorResponse("User not authenticated", 401, "UNAUTHORIZED");
    }

    // 2. Get search query param
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    // 3. Build query
    let query = supabase
      .from("categories")
      .select("*")
      .order("created_at", { ascending: false });

    // If search param provided, filter by category name
    if (search && search.trim().length > 0) {
      query = query.ilike("category_name", `%${search.trim()}%`);
    }

    // 4. Execute query
    const { data, error } = await query;

    if (error) {
      console.error("[GET /api/categories] fetch error:", error);
      return errorResponse("Failed to fetch categories", 500, "DB_FETCH_ERROR");
    }

    // 5. Return response
    return NextResponse.json({
      success: true,
      data: data,
      count: data.length,
    });

  } catch (error) {
    console.error("[GET /api/categories] unexpected error:", error);
    return errorResponse("Internal Server Error", 500, "INTERNAL_ERROR");
  }
}
