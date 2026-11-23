import 'dotenv/config';
import express from "express";

const app = express();
const PORT = 3000;
import pool from './db.js';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import { authenticate, authorizeRoles } from './middleware/middleauth.js';
app.use(express.json());

// Allow the React (Vite) frontend to call this API, including the Authorization header
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.get('/', (req, res) => {
    res.send('Travel Destination API is running successfully!');
});


// Validate destination request data
function validateDestination(req, res, next) {
  const { name, country, duration, budget } = req.body;

  if (
    typeof name !== "string" ||
    name.trim() === "" ||
    typeof country !== "string" ||
    country.trim() === "" ||
    !Number.isInteger(duration) ||
    duration <= 0 ||
    typeof budget !== "number" ||
    !Number.isFinite(budget) ||
    budget < 0
  ) {
    return res.status(400).json({
      error:
        "Name and country must be non-empty strings, duration must be a positive integer, and budget must be a non-negative number."
    });
  }

  // Remove unnecessary spaces
  req.body.name = name.trim();
  req.body.country = country.trim();

  next();
}

// Validate destination ID
function validateId(req, res, next) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "Destination ID must be a positive integer"
    });
  }

  req.destinationId = id;
  next();
}




// 1. CREATE a destination in PostgreSQL
app.post(
  "/api/destinations",
  authenticate,
  authorizeRoles('admin'),
  validateDestination,
  async (req, res) => {
    try {
      const { name, country, duration, budget } = req.body;

      const result = await pool.query(
        `INSERT INTO public.destinations
         (name, country, duration, budget)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, country, duration, budget`,
        [name, country, duration, budget]
      );

      res.status(201).json({
        message: "Destination added successfully",
        destination: result.rows[0]
      });
    } catch (err) {
      console.error("Create destination error:", err.message);
      res.status(500).json({ error: "Database error" });
    }
  }
);



// 2. READ all destinations with filtering and sorting
app.get("/api/destinations", authenticate, async (req, res) => {
  try {
    const {
  name,
  title,
  country,
  minDuration,
  maxDuration,
  sortBy = "id",
  order = "asc"
} = req.query;

    const searchName = name || title;

    // Validate duration filters
    if (
      (minDuration !== undefined &&
        (!/^\d+$/.test(minDuration) || Number(minDuration) < 1)) ||
      (maxDuration !== undefined &&
        (!/^\d+$/.test(maxDuration) || Number(maxDuration) < 1))
    ) {
      return res.status(400).json({
        error: "Duration filters must be positive integers"
      });
    }

    if (
      minDuration !== undefined &&
      maxDuration !== undefined &&
      Number(minDuration) > Number(maxDuration)
    ) {
      return res.status(400).json({
        error: "minDuration cannot exceed maxDuration"
      });
    }

    // Only allow approved sorting columns
    const allowedSortFields = [
      "id", "name", "country", "duration", "budget"
    ];

    if (!allowedSortFields.includes(sortBy)) {
      return res.status(400).json({
        error: "Invalid sort field"
      });
    }

    const sortOrder = order.toLowerCase();

    if (!["asc", "desc"].includes(sortOrder)) {
      return res.status(400).json({
        error: "Order must be asc or desc"
      });
    }

    let query = `
      SELECT id, name, country, duration, budget
      FROM public.destinations
      WHERE 1=1
    `;

    const values = [];

    if (searchName) {
      values.push(`%${searchName}%`);
      query += ` AND name ILIKE $${values.length}`;
    }
    if (country) {
       values.push(`%${country}%`);
       query += ` AND country ILIKE $${values.length}`;
   }
    if (minDuration !== undefined) {
      values.push(Number(minDuration));
      query += ` AND duration >= $${values.length}`;
    }

    if (maxDuration !== undefined) {
      values.push(Number(maxDuration));
      query += ` AND duration <= $${values.length}`;
    }

    query += ` ORDER BY ${sortBy} ${sortOrder}`;

    const result = await pool.query(query, values);

    res.status(200).json({
      value: result.rows,
      Count: result.rowCount
    });

  } catch (err) {
    console.error("Fetch destinations error:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});
// 3. GET destination summary
app.get("/api/destinations/summary", authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) AS total_destinations,
        ROUND(AVG(duration), 2) AS average_duration,
        MIN(duration) AS minimum_duration,
        MAX(duration) AS maximum_duration,
        COALESCE(SUM(duration), 0) AS total_duration
      FROM public.destinations
    `);

    res.status(200).json({
      summary: result.rows[0]
    });

  } catch (err) {
    console.error("Summary error:", err.message);
    res.status(500).json({
      error: "Database error"
    });
  }
});


 // 4. GROUP BY country
app.get("/api/destinations/summary/by-country", authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        country,
        COUNT(*) AS total_destinations,
        ROUND(AVG(duration), 2) AS average_duration,
        SUM(budget) AS total_budget
      FROM public.destinations
      GROUP BY country
      ORDER BY country ASC
    `);

    res.status(200).json({
      message: "Country-wise destination summary",
      data: result.rows
    });

  } catch (err) {
    console.error("Group summary error:", err.message);
    res.status(500).json({
      error: "Database error"
    });
  }
});
// GET one destination by ID
app.get("/api/destinations/:id", authenticate, validateId, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, country, duration, budget
       FROM public.destinations
       WHERE id = $1`,
      [req.destinationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Destination not found"
      });
    }

    res.status(200).json({
      destination: result.rows[0]
    });

  } catch (err) {
    console.error("Get destination error:", err.message);
    res.status(500).json({
      error: "Database error"
    });
  }
});

 // 4. UPDATE a destination in PostgreSQL
app.put(
  "/api/destinations/:id",
  authenticate,
  authorizeRoles('admin'),
  validateId,
  validateDestination,
  async (req, res) => {
    try {
      const id = req.destinationId;
      const { name, country, duration, budget } = req.body;

      const result = await pool.query(
        `UPDATE public.destinations
         SET name = $1,
             country = $2,
             duration = $3,
             budget = $4
         WHERE id = $5
         RETURNING id, name, country, duration, budget`,
        [name, country, duration, budget, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Destination not found"
        });
      }

      res.status(200).json({
        message: "Destination updated successfully",
        destination: result.rows[0]
      });

    } catch (err) {
      console.error("Update destination error:", err.message);
      res.status(500).json({
        error: "Database error"
      });
    }
  }
);

 // 5. DELETE a destination from PostgreSQL
app.delete("/api/destinations/:id", authenticate, authorizeRoles('admin'), validateId, async (req, res) => {
  try {
    const id = req.destinationId;

    const result = await pool.query(
      `DELETE FROM public.destinations
       WHERE id = $1
       RETURNING id, name, country, duration, budget`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Destination not found"
      });
    }

    res.status(200).json({
      message: "Destination deleted successfully",
      destination: result.rows[0]
    });

  } catch (err) {
    console.error("Delete destination error:", err.message);
    res.status(500).json({
      error: "Database error"
    });
  }
});

app.get('/db-test', authenticate, authorizeRoles('admin'), async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM destinations'
        );

        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Database error');
    }
});
app.use('/api/auth', authRoutes);

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found"
  });
});

// Handle malformed JSON and unexpected errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      error: "Invalid JSON request body"
    });
  }

  console.error(err);

  res.status(500).json({
    error: "Internal server error"
  });
});

// Start the server
// Start the server
app.listen(PORT, (err) => {
  if (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
  console.log(
    `Travel Destination API running at http://localhost:${PORT}`
  );
});
