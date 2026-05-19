require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Serve static files from React build
app.use(express.static(path.join(__dirname, '../client/dist')));

// 1. Galleries List
app.get('/api/galleries', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM galleries ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch galleries' });
  }
});

// 2. Posts List (per gallery)
app.get('/api/galleries/:slug/posts', async (req, res) => {
  const { slug } = req.params;
  const { page = 1, limit = 30, type = 'all' } = req.query;
  const offset = (page - 1) * limit;

  try {
    const galleryRes = await db.query('SELECT id FROM galleries WHERE slug = $1', [slug]);
    if (galleryRes.rows.length === 0) return res.status(404).json({ error: 'Gallery not found' });
    const galleryId = galleryRes.rows[0].id;

    let query = `
      SELECT p.*, 
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count 
      FROM posts p 
      WHERE gallery_id = $1
    `;
    const params = [galleryId];

    if (type === 'concept') {
      query += ` AND recommends >= 5`;
    }

    query += ` ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
    params.push(limit, offset);

    const postsRes = await db.query(query, params);
    res.json(postsRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// 3. Post Detail
app.get('/api/posts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const postRes = await db.query('SELECT * FROM posts WHERE id = $1', [id]);
    if (postRes.rows.length === 0) return res.status(404).json({ error: 'Post not found' });
    
    // Update views
    await db.query('UPDATE posts SET views = views + 1 WHERE id = $1', [id]);
    
    res.json(postRes.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// 4. Create Post
app.post('/api/posts', async (req, res) => {
  const { gallery_id, title, content, author_name, password, author_ip } = req.body;
  
  if (!gallery_id || !title || !content || !author_name || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = await db.query(
      'INSERT INTO posts (gallery_id, title, content, author_name, password, author_ip) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [gallery_id, title, content, author_name, password, author_ip]
    );
    res.json({ success: true, postId: result.rows[0].id });
  } catch (err) {
    console.error('Database Error during post creation:', err);
    res.status(500).json({ error: 'Failed to create post. Please check if the database schema is up to date (dislikes column).' });
  }
});

// 5. Delete Post
app.delete('/api/posts/:id', async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  try {
    const postRes = await db.query('SELECT password FROM posts WHERE id = $1', [id]);
    if (postRes.rows.length === 0) return res.status(404).json({ error: 'Post not found' });
    
    if (postRes.rows[0].password !== password) {
      return res.status(403).json({ error: 'Incorrect password' });
    }

    await db.query('DELETE FROM posts WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// 6. Comments List
app.get('/api/posts/:id/comments', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at ASC', [id]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// 7. Create Comment
app.post('/api/posts/:id/comments', async (req, res) => {
  const { id } = req.params;
  const { author_name, password, content } = req.body;
  try {
    await db.query(
      'INSERT INTO comments (post_id, author_name, password, content) VALUES ($1, $2, $3, $4)',
      [id, author_name, password, content]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// 8. Recommend Post
app.post('/api/posts/:id/recommend', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE posts SET recommends = recommends + 1 WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to recommend post' });
  }
});

// 9. Dislike Post
app.post('/api/posts/:id/dislike', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE posts SET dislikes = dislikes + 1 WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to dislike post' });
  }
});

// 10. Delete Comment
app.delete('/api/comments/:id', async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  try {
    const commentRes = await db.query('SELECT password FROM comments WHERE id = $1', [id]);
    if (commentRes.rows.length === 0) return res.status(404).json({ error: 'Comment not found' });
    
    if (commentRes.rows[0].password !== password) {
      return res.status(403).json({ error: 'Incorrect password' });
    }

    await db.query('DELETE FROM comments WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Serve frontend for any other routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
