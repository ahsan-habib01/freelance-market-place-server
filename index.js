const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// JWT Secret (Add this to your .env file)
const JWT_SECRET =
  process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gz7uf4p.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: 'Invalid token' });
    }
    req.user = decoded;
    next();
  });
};

// Middleware to verify admin role
const verifyAdmin = async (req, res, next) => {
  const email = req.user.email;
  const user = await usersCollection.findOne({ email });

  if (user?.role !== 'admin') {
    return res.status(403).send({ message: 'Forbidden access' });
  }
  next();
};

let usersCollection,
  jobsCollection,
  acceptedCollection,
  categoriesCollection,
  reviewsCollection;

async function run() {
  try {
    const db = client.db('freelify-db');
    usersCollection = db.collection('users');
    jobsCollection = db.collection('jobs');
    acceptedCollection = db.collection('accepted-jobs');
    categoriesCollection = db.collection('categories');
    reviewsCollection = db.collection('reviews');

    // ==================== AUTHENTICATION ROUTES ====================

    // Register User
    app.post('/auth/register', async (req, res) => {
      try {
        const { name, email, password, photoURL } = req.body;

        // Check if user already exists
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).send({ message: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const newUser = {
          name,
          email,
          password: hashedPassword,
          photoURL: photoURL || '',
          role: 'user', // Default role
          createdAt: new Date(),
          bio: '',
          phone: '',
          location: '',
          skills: [],
        };

        const result = await usersCollection.insertOne(newUser);

        // Generate JWT token
        const token = jwt.sign(
          { email: newUser.email, role: newUser.role },
          JWT_SECRET,
          { expiresIn: '7d' }
        );

        res.send({
          success: true,
          token,
          user: { name, email, photoURL, role: 'user' },
        });
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Registration failed', error: error.message });
      }
    });

    // Login User
    app.post('/auth/login', async (req, res) => {
      try {
        const { email, password } = req.body;

        // Find user
        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ message: 'User not found' });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          return res.status(401).send({ message: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
          { email: user.email, role: user.role },
          JWT_SECRET,
          { expiresIn: '7d' }
        );

        res.send({
          success: true,
          token,
          user: {
            name: user.name,
            email: user.email,
            photoURL: user.photoURL,
            role: user.role,
          },
        });
      } catch (error) {
        res.status(500).send({ message: 'Login failed', error: error.message });
      }
    });

    // Get Current User Profile
    app.get('/auth/me', verifyToken, async (req, res) => {
      try {
        const user = await usersCollection.findOne(
          { email: req.user.email },
          { projection: { password: 0 } }
        );
        res.send(user);
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Failed to fetch user', error: error.message });
      }
    });

    // ==================== USER PROFILE ROUTES ====================

    // Get User Profile
    app.get('/users/profile/:email', verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne(
          { email },
          { projection: { password: 0 } }
        );
        res.send(user);
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Failed to fetch profile', error: error.message });
      }
    });

    // Update User Profile
    app.put('/users/profile/:email', verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        const updateData = req.body;

        // Remove sensitive fields
        delete updateData.password;
        delete updateData.role;
        delete updateData.email;

        const result = await usersCollection.updateOne(
          { email },
          { $set: { ...updateData, updatedAt: new Date() } }
        );

        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Failed to update profile', error: error.message });
      }
    });

    // ==================== JOB ROUTES (PUBLIC & PROTECTED) ====================

    // Get All Jobs with Search, Filter, Sort, Pagination
    // Backend route for /jobs endpoint
// Add this to your jobs routes file (e.g., jobsRoutes.js)

app.get('/jobs', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      sort = 'desc',
      search = '',
      category = '',
      location = ''
    } = req.query;

    // Convert to numbers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build filter object
    const filter = {};

    // Search filter - searches in title, description, and skills
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { skills: { $regex: search, $options: 'i' } }
      ];
    }

    // Category filter
    if (category) {
      filter.category = category;
    }

    // Location filter
    if (location) {
      filter.location = location;
    }

    // Sort order (by createdAt or posted date)
    const sortOrder = sort === 'asc' ? 1 : -1;
    const sortBy = { createdAt: sortOrder };

    // Get total count for pagination
    const total = await jobsCollection.countDocuments(filter);

    // Get paginated jobs
    const jobs = await jobsCollection
      .find(filter)
      .sort(sortBy)
      .skip(skip)
      .limit(limitNum)
      .toArray();

    res.send({
      jobs,
      total,
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum)
    });

  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).send({ error: 'Failed to fetch jobs' });
  }
});

    // Get Single Job by ID (Public)
    app.get('/jobs/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const job = await jobsCollection.findOne({ _id: new ObjectId(id) });

        if (!job) {
          return res.status(404).send({ message: 'Job not found' });
        }

        res.send(job);
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Failed to fetch job', error: error.message });
      }
    });

    // Get Latest 8 Jobs (For Home Page)
    app.get('/latest-jobs', async (req, res) => {
      try {
        const jobs = await jobsCollection
          .find()
          .sort({ postedAt: -1 })
          .limit(8)
          .toArray();
        res.send(jobs);
      } catch (error) {
        res
          .status(500)
          .send({
            message: 'Failed to fetch latest jobs',
            error: error.message,
          });
      }
    });

    // Get Related Jobs (For Details Page)
    app.get('/jobs/:id/related', async (req, res) => {
      try {
        const id = req.params.id;
        const job = await jobsCollection.findOne({ _id: new ObjectId(id) });

        const relatedJobs = await jobsCollection
          .find({
            category: job.category,
            _id: { $ne: new ObjectId(id) },
          })
          .limit(4)
          .toArray();

        res.send(relatedJobs);
      } catch (error) {
        res
          .status(500)
          .send({
            message: 'Failed to fetch related jobs',
            error: error.message,
          });
      }
    });

    // Add Job (Protected - User)
    app.post('/jobs', verifyToken, async (req, res) => {
      try {
        const job = req.body;
        job.postedAt = new Date();
        job.userEmail = req.user.email;

        const result = await jobsCollection.insertOne(job);
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Failed to add job', error: error.message });
      }
    });

    // Get My Added Jobs (Protected - User)
    app.get('/myAddedJobs', verifyToken, async (req, res) => {
      try {
        const email = req.user.email;
        const jobs = await jobsCollection
          .find({ userEmail: email })
          .sort({ postedAt: -1 })
          .toArray();
        res.send(jobs);
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Failed to fetch jobs', error: error.message });
      }
    });

    // Update Job (Protected - User owns the job)
    app.put('/updateJob/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const updatedJob = req.body;

        // Verify ownership
        const job = await jobsCollection.findOne({ _id: new ObjectId(id) });
        if (job.userEmail !== req.user.email && req.user.role !== 'admin') {
          return res
            .status(403)
            .send({ message: 'You can only update your own jobs' });
        }

        delete updatedJob._id;
        updatedJob.updatedAt = new Date();

        const result = await jobsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedJob }
        );

        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Failed to update job', error: error.message });
      }
    });

    // Delete Job (Protected - User owns the job)
    app.delete('/deleteJob/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;

        // Verify ownership
        const job = await jobsCollection.findOne({ _id: new ObjectId(id) });
        if (job.userEmail !== req.user.email && req.user.role !== 'admin') {
          return res
            .status(403)
            .send({ message: 'You can only delete your own jobs' });
        }

        const result = await jobsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Failed to delete job', error: error.message });
      }
    });

    // ==================== ACCEPTED JOBS ROUTES ====================

    // Accept Job (Protected - User)
    app.post('/accepted-jobs', verifyToken, async (req, res) => {
      try {
        const task = req.body;
        task.userEmail = req.user.email;
        task.acceptedAt = new Date();
        task.status = 'in-progress'; // pending, in-progress, completed, cancelled

        const result = await acceptedCollection.insertOne(task);
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Failed to accept job', error: error.message });
      }
    });

    // Get My Accepted Jobs (Protected - User)
    app.get('/my-accepted-jobs', verifyToken, async (req, res) => {
      try {
        const email = req.user.email;
        const tasks = await acceptedCollection
          .find({ userEmail: email })
          .sort({ acceptedAt: -1 })
          .toArray();
        res.send(tasks);
      } catch (error) {
        res
          .status(500)
          .send({
            message: 'Failed to fetch accepted jobs',
            error: error.message,
          });
      }
    });

    // Update Accepted Job Status (Protected - User)
    app.put('/accepted-jobs/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        const task = await acceptedCollection.findOne({
          _id: new ObjectId(id),
        });
        if (task.userEmail !== req.user.email) {
          return res.status(403).send({ message: 'Unauthorized' });
        }

        const result = await acceptedCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status, updatedAt: new Date() } }
        );

        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Failed to update status', error: error.message });
      }
    });

    // Delete Accepted Job (Protected - User)
    app.delete('/accepted-jobs/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;

        const task = await acceptedCollection.findOne({
          _id: new ObjectId(id),
        });
        if (task.userEmail !== req.user.email && req.user.role !== 'admin') {
          return res.status(403).send({ message: 'Unauthorized' });
        }

        const result = await acceptedCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Failed to delete', error: error.message });
      }
    });

    // ==================== CATEGORIES ROUTES ====================

    // Get All Categories (Public)
    app.get('/categories', async (req, res) => {
      try {
        const categories = await categoriesCollection.find().toArray();
        res.send(categories);
      } catch (error) {
        res
          .status(500)
          .send({
            message: 'Failed to fetch categories',
            error: error.message,
          });
      }
    });

    // Add Category (Admin Only)
    app.post('/categories', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const category = req.body;
        const result = await categoriesCollection.insertOne(category);
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Failed to add category', error: error.message });
      }
    });

    // ==================== REVIEWS ROUTES ====================

    // Get Reviews for a Job (Public)
    app.get('/reviews/:jobId', async (req, res) => {
      try {
        const jobId = req.params.jobId;
        const reviews = await reviewsCollection
          .find({ jobId })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(reviews);
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Failed to fetch reviews', error: error.message });
      }
    });

    // Add Review (Protected - User)
    app.post('/reviews', verifyToken, async (req, res) => {
      try {
        const review = req.body;
        review.userEmail = req.user.email;
        review.createdAt = new Date();

        const result = await reviewsCollection.insertOne(review);
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Failed to add review', error: error.message });
      }
    });

    // ==================== DASHBOARD STATISTICS ROUTES ====================

    // User Dashboard Stats (Protected - User)
    app.get('/dashboard/user/stats', verifyToken, async (req, res) => {
      try {
        const email = req.user.email;

        const totalJobsPosted = await jobsCollection.countDocuments({
          userEmail: email,
        });
        const totalJobsAccepted = await acceptedCollection.countDocuments({
          userEmail: email,
        });
        const completedJobs = await acceptedCollection.countDocuments({
          userEmail: email,
          status: 'completed',
        });
        const inProgressJobs = await acceptedCollection.countDocuments({
          userEmail: email,
          status: 'in-progress',
        });

        // Monthly earnings (example - calculate based on completed jobs)
        const completedJobsList = await acceptedCollection
          .find({ userEmail: email, status: 'completed' })
          .toArray();

        const totalEarnings = completedJobsList.reduce(
          (sum, job) => sum + (job.price || 0),
          0
        );

        res.send({
          totalJobsPosted,
          totalJobsAccepted,
          completedJobs,
          inProgressJobs,
          totalEarnings,
        });
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Failed to fetch stats', error: error.message });
      }
    });

    // User Dashboard Chart Data (Protected - User)
    app.get('/dashboard/user/chart', verifyToken, async (req, res) => {
      try {
        const email = req.user.email;

        // Get jobs posted per month (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const jobsByMonth = await jobsCollection
          .aggregate([
            {
              $match: {
                userEmail: email,
                postedAt: { $gte: sixMonthsAgo },
              },
            },
            {
              $group: {
                _id: {
                  month: { $month: '$postedAt' },
                  year: { $year: '$postedAt' },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } },
          ])
          .toArray();

        res.send(jobsByMonth);
      } catch (error) {
        res
          .status(500)
          .send({
            message: 'Failed to fetch chart data',
            error: error.message,
          });
      }
    });

    // Admin Dashboard Stats (Protected - Admin)
    app.get(
      '/dashboard/admin/stats',
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const totalUsers = await usersCollection.countDocuments();
          const totalJobs = await jobsCollection.countDocuments();
          const totalAcceptedJobs = await acceptedCollection.countDocuments();
          const totalCategories = await categoriesCollection.countDocuments();

          // Recent activity
          const recentJobs = await jobsCollection
            .find()
            .sort({ postedAt: -1 })
            .limit(5)
            .toArray();

          res.send({
            totalUsers,
            totalJobs,
            totalAcceptedJobs,
            totalCategories,
            recentJobs,
          });
        } catch (error) {
          res
            .status(500)
            .send({
              message: 'Failed to fetch admin stats',
              error: error.message,
            });
        }
      }
    );

    // Admin Dashboard Chart Data (Protected - Admin)
    app.get(
      '/dashboard/admin/chart',
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          // Jobs by category
          const jobsByCategory = await jobsCollection
            .aggregate([
              {
                $group: {
                  _id: '$category',
                  count: { $sum: 1 },
                },
              },
            ])
            .toArray();

          // User growth over time
          const userGrowth = await usersCollection
            .aggregate([
              {
                $group: {
                  _id: {
                    month: { $month: '$createdAt' },
                    year: { $year: '$createdAt' },
                  },
                  count: { $sum: 1 },
                },
              },
              { $sort: { '_id.year': 1, '_id.month': 1 } },
            ])
            .toArray();

          res.send({
            jobsByCategory,
            userGrowth,
          });
        } catch (error) {
          res
            .status(500)
            .send({
              message: 'Failed to fetch chart data',
              error: error.message,
            });
        }
      }
    );

    // ==================== ADMIN USER MANAGEMENT ====================

    // Get All Users (Admin Only)
    app.get('/admin/users', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const users = await usersCollection
          .find({}, { projection: { password: 0 } })
          .toArray();
        res.send(users);
      } catch (error) {
        res
          .status(500)
          .send({ message: 'Failed to fetch users', error: error.message });
      }
    });

    // Update User Role (Admin Only)
    app.patch(
      '/admin/users/:email/role',
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const email = req.params.email;
          const { role } = req.body;

          const result = await usersCollection.updateOne(
            { email },
            { $set: { role, updatedAt: new Date() } }
          );

          res.send(result);
        } catch (error) {
          res
            .status(500)
            .send({ message: 'Failed to update role', error: error.message });
        }
      }
    );

    // Delete User (Admin Only)
    app.delete(
      '/admin/users/:email',
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const email = req.params.email;
          const result = await usersCollection.deleteOne({ email });
          res.send(result);
        } catch (error) {
          res
            .status(500)
            .send({ message: 'Failed to delete user', error: error.message });
        }
      }
    );

    // ==================== HEALTH CHECK ====================

    app.get('/', (req, res) => {
      res.send({
        message: 'Freelify Server is Running Smoothly...',
        timestamp: new Date(),
      });
    });

    console.log('Successfully connected to MongoDB!');
  } finally {
    // Keep connection open
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Freelify Server running on port ${port}`);
});
