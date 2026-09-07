// ===================================================
// CONTROLLER FILE COMMENTS (command/diskusi per file)
// ===================================================

const asyncHandler = require('../middlewares/asyncHandler');
const { db } = require('../config/database');
const FileComment = require('../models/FileComment');
const FileNotification = require('../models/FileNotification');
const { AppError } = require('../utils/errors');

const VALID_KINDS = new Set(['materi', 'project', 'tugas', 'uts', 'uas']);
const KIND_TABLES = {
  materi: 'materials',
  project: 'projects',
  tugas: 'tugas',
  uts: 'uts',
  uas: 'uas'
};

function parseKind(raw) {
  const kind = String(raw || '').trim().toLowerCase();
  if (!VALID_KINDS.has(kind)) {
    throw new AppError(400, 'Jenis file tidak valid');
  }
  return kind;
}

function parseFileId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw new AppError(400, 'ID file tidak valid');
  }
  return id;
}

async function getFileName(kind, fileId) {
  const table = KIND_TABLES[kind];
  const [rows] = await db.query(
    `SELECT original_name FROM ${table} WHERE id = ? LIMIT 1`,
    [fileId]
  );
  return rows.length ? rows[0].original_name : 'File';
}

function extractMentions(content) {
  const found = new Set();
  const re = /@([A-Za-z0-9_.-]+)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    found.add(m[1].toLowerCase());
  }
  return Array.from(found);
}

async function createMentionNotifications({ kind, fileId, senderId, content }) {
  const mentioned = extractMentions(content);
  if (mentioned.length === 0) return;

  const [users] = await db.query(
    'SELECT id, username FROM users WHERE is_active = 1'
  );
  const byUsername = new Map(users.map((u) => [u.username.toLowerCase(), u]));
  const targets = mentioned
    .map((name) => byUsername.get(name))
    .filter((u) => u && u.id !== senderId);

  if (targets.length === 0) return;

  const fileName = await getFileName(kind, fileId);
  const created = await FileComment.listByFile(kind, fileId);
  const latest = created[created.length - 1];

  for (const target of targets) {
    await FileNotification.create({
      userId: target.id,
      senderId,
      commentId: latest ? latest.id : 0,
      fileKind: kind,
      fileId,
      fileName,
      content: content.slice(0, 300)
    });
  }
}

exports.listComments = asyncHandler(async (req, res) => {
  const kind = parseKind(req.params.kind);
  const fileId = parseFileId(req.params.id);
  const comments = await FileComment.listByFile(kind, fileId);
  res.json({ comments });
});

exports.createComment = asyncHandler(async (req, res) => {
  const kind = parseKind(req.params.kind);
  const fileId = parseFileId(req.params.id);

  const content = String(req.body.content || '').trim().slice(0, 2000);
  if (!content) {
    throw new AppError(422, 'Isi command tidak boleh kosong');
  }

  let parentId = null;
  if (req.body.parent_id != null && req.body.parent_id !== '') {
    parentId = parseFileId(req.body.parent_id);
    const parent = await FileComment.listByFile(kind, fileId);
    if (!parent.some((c) => c.id === parentId)) {
      throw new AppError(400, 'Command yang dibalas tidak ditemukan');
    }
  }

  const id = await FileComment.create({
    fileKind: kind,
    fileId,
    userId: req.user.id,
    content,
    parentId
  });

  const comments = await FileComment.listByFile(kind, fileId);
  const created = comments.find((c) => c.id === id);

  await createMentionNotifications({
    kind,
    fileId,
    senderId: req.user.id,
    content
  });

  res.status(201).json({ message: 'Command berhasil dikirim', comment: created });
});

exports.deleteComment = asyncHandler(async (req, res) => {
  const kind = parseKind(req.params.kind);
  const fileId = parseFileId(req.params.id);
  const commentId = parseFileId(req.params.commentId);

  const comments = await FileComment.listByFile(kind, fileId);
  const comment = comments.find((c) => c.id === commentId);
  if (!comment) {
    throw new AppError(404, 'Command tidak ditemukan');
  }

  const isOwner = comment.user_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) {
    throw new AppError(403, 'Anda tidak berhak menghapus command ini');
  }

  const toDelete = [commentId];
  let frontier = [commentId];
  while (frontier.length > 0) {
    const [rows] = await db.query(
      'SELECT id FROM file_comments WHERE parent_id IN (?)',
      [frontier]
    );
    frontier = rows.map((r) => r.id);
    if (frontier.length > 0) toDelete.push(...frontier);
  }

  await db.query('DELETE FROM file_comments WHERE id IN (?)', [toDelete]);

  res.json({ message: 'Command dan seluruh balasannya berhasil dihapus' });
});
