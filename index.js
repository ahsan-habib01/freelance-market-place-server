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

// JWT Secret
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

// Global collection variables
let usersCollection,
  jobsCollection,
  acceptedCollection,
  categoriesCollection,
  reviewsCollection;

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

// ==================== HEALTH CHECK (ALWAYS AVAILABLE) ====================
app.get('/', (req, res) => {
  res.send({
    message: '🚀 Freelify Server is Running!',
    status: 'active',
    timestamp: new Date(),
    routes: {
      health: '/',
      auth: '/auth/register, /auth/login',
      jobs: '/jobs, /latest-jobs',
      categories: '/categories',
    },
  });
});

// ==================== DATABASE CONNECTION & ROUTE SETUP ====================
async function connectDB() {
  try {
    await client.connect();
    console.log('✅ Successfully connected to MongoDB!');

    const db = client.db('freelify-db');
    usersCollection = db.collection('users');
    jobsCollection = db.collection('jobs');
    acceptedCollection = db.collection('accepted-jobs');
    categoriesCollection = db.collection('categories');
    reviewsCollection = db.collection('reviews');

    // Create unique index on email
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    console.log('✅ Database indexes created');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
}

// Connect to database first
connectDB();

// ==================== AUTHENTICATION ROUTES ====================

// Register User
app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password, photoURL } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await usersCollection.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      console.log('❌ Email already exists:', normalizedEmail);
      return res.status(400).json({
        success: false,
        message: 'This email is already registered. Please login instead.',
      });
    }

    console.log('✅ Email available:', normalizedEmail);

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      photoURL: photoURL || '',
      role: 'user',
      createdAt: new Date(),
    };

    const result = await usersCollection.insertOne(newUser);
    console.log('✅ User saved to MongoDB:', normalizedEmail);

    const token = jwt.sign(
      {
        userId: result.insertedId,
        email: normalizedEmail,
        role: newUser.role,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: result.insertedId,
        name: newUser.name,
        email: newUser.email,
        photoURL: newUser.photoURL,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error('❌ Registration error:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'This email is already registered',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// Login User
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    console.log('🔵 Login attempt for:', normalizedEmail);

    const user = await usersCollection.findOne({ email: normalizedEmail });

    if (!user) {
      console.log('❌ User not found:', normalizedEmail);
      return res.status(404).json({
        success: false,
        message: 'User not found. Please register first.',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      console.log('❌ Invalid password for:', normalizedEmail);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    console.log('✅ Login successful:', normalizedEmail);

    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        photoURL: user.photoURL,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
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

// Check if email exists
app.post('/auth/check-email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        exists: false,
        message: 'Email is required',
      });
    }

    const existingUser = await usersCollection.findOne({
      email: email.toLowerCase().trim(),
    });

    if (existingUser) {
      return res.status(200).json({
        exists: true,
        message: 'Email is already registered',
      });
    }

    return res.status(200).json({
      exists: false,
      message: 'Email is available',
    });
  } catch (error) {
    console.error('Check email error:', error);
    return res.status(500).json({
      exists: false,
      message: 'Server error',
    });
  }
});

// ==================== USER PROFILE ROUTES ====================

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

app.put('/users/profile/:email', verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    const updateData = req.body;

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

// ==================== JOB ROUTES ====================

app.get('/jobs', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      sort = 'desc',
      search = '',
      category = '',
      location = '',
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { skills: { $regex: search, $options: 'i' } },
      ];
    }

    if (category) {
      filter.category = category;
    }

    if (location) {
      filter.location = location;
    }

    const sortOrder = sort === 'asc' ? 1 : -1;
    const sortBy = { createdAt: sortOrder };

    const total = await jobsCollection.countDocuments(filter);

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
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).send({ error: 'Failed to fetch jobs' });
  }
});

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
      .send({ message: 'Failed to fetch latest jobs', error: error.message });
  }
});

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
      .send({ message: 'Failed to fetch related jobs', error: error.message });
  }
});

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

app.put('/updateJob/:id', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const updatedJob = req.body;

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

app.delete('/deleteJob/:id', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;

    const job = await jobsCollection.findOne({ _id: new ObjectId(id) });
    if (job.userEmail !== req.user.email && req.user.role !== 'admin') {
      return res
        .status(403)
        .send({ message: 'You can only delete your own jobs' });
    }

    const result = await jobsCollection.deleteOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    res
      .status(500)
      .send({ message: 'Failed to delete job', error: error.message });
  }
});

// ==================== ACCEPTED JOBS ====================

app.post('/accepted-jobs', verifyToken, async (req, res) => {
  try {
    const task = req.body;
    task.userEmail = req.user.email;
    task.acceptedAt = new Date();
    task.status = 'in-progress';

    const result = await acceptedCollection.insertOne(task);
    res.send(result);
  } catch (error) {
    res
      .status(500)
      .send({ message: 'Failed to accept job', error: error.message });
  }
});

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
      .send({ message: 'Failed to fetch accepted jobs', error: error.message });
  }
});

app.put('/accepted-jobs/:id', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;

    const task = await acceptedCollection.findOne({ _id: new ObjectId(id) });
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

app.delete('/accepted-jobs/:id', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;

    const task = await acceptedCollection.findOne({ _id: new ObjectId(id) });
    if (task.userEmail !== req.user.email && req.user.role !== 'admin') {
      return res.status(403).send({ message: 'Unauthorized' });
    }

    const result = await acceptedCollection.deleteOne({
      _id: new ObjectId(id),
    });
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: 'Failed to delete', error: error.message });
  }
});

// ==================== CATEGORIES ====================

app.get('/categories', async (req, res) => {
  try {
    const categories = await categoriesCollection.find().toArray();
    res.send(categories);
  } catch (error) {
    res
      .status(500)
      .send({ message: 'Failed to fetch categories', error: error.message });
  }
});

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

// ==================== REVIEWS ====================

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

// ==================== DASHBOARD STATS ====================

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

app.get('/dashboard/user/chart', verifyToken, async (req, res) => {
  try {
    const email = req.user.email;

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
      .send({ message: 'Failed to fetch chart data', error: error.message });
  }
});

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
        .send({ message: 'Failed to fetch admin stats', error: error.message });
    }
  }
);

app.get(
  '/dashboard/admin/chart',
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
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
        .send({ message: 'Failed to fetch chart data', error: error.message });
    }
  }
);

// ==================== ADMIN USER MANAGEMENT ====================

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

// ==================== START SERVER ====================

app.listen(port, () => {
  console.log(`🚀 Freelify Server running on port ${port}`);
});
