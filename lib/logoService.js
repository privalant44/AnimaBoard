const { getSupabase } = require('./supabaseClient');

const BUCKET = 'app-assets';
const META_KEY = 'company_logo';
const MAX_BYTES = 2 * 1024 * 1024;

const EXT_BY_TYPE = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
};

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!match) {
    const err = new Error('Format dataUrl invalide');
    err.status = 400;
    throw err;
  }
  const contentType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  return { contentType, buffer };
}

function buildPublicUrl(supabase, path, updatedAt) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const base = data?.publicUrl || null;
  if (!base) return null;
  return updatedAt ? `${base}?v=${encodeURIComponent(updatedAt)}` : base;
}

async function getLogoMetadata(supabase) {
  const { data, error } = await supabase
    .from('app_metadata')
    .select('value')
    .eq('key', META_KEY)
    .maybeSingle();
  if (error) throw error;
  return data?.value || null;
}

async function getCompanyLogo() {
  const supabase = getSupabase();
  if (!supabase) return { url: null, updatedAt: null };

  const meta = await getLogoMetadata(supabase);
  if (!meta?.path) return { url: null, updatedAt: null };

  return {
    url: buildPublicUrl(supabase, meta.path, meta.updated_at),
    updatedAt: meta.updated_at || null,
  };
}

async function uploadCompanyLogo(dataUrl) {
  const supabase = getSupabase();
  if (!supabase) {
    const err = new Error('Supabase non configuré');
    err.status = 503;
    throw err;
  }

  const { contentType, buffer } = parseDataUrl(dataUrl);
  if (!contentType.startsWith('image/')) {
    const err = new Error('Le fichier doit être une image');
    err.status = 400;
    throw err;
  }
  if (buffer.length > MAX_BYTES) {
    const err = new Error('Image trop volumineuse (max 2 Mo)');
    err.status = 400;
    throw err;
  }

  const ext = EXT_BY_TYPE[contentType];
  if (!ext) {
    const err = new Error('Type d’image non supporté');
    err.status = 400;
    throw err;
  }

  const path = `company-logo.${ext}`;
  const previous = await getLogoMetadata(supabase);

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    upsert: true,
    contentType,
  });
  if (uploadError) throw uploadError;

  if (previous?.path && previous.path !== path) {
    await supabase.storage.from(BUCKET).remove([previous.path]);
  }

  const updatedAt = new Date().toISOString();
  const value = { path, content_type: contentType, updated_at: updatedAt };
  const { error: metaError } = await supabase
    .from('app_metadata')
    .upsert({ key: META_KEY, value, updated_at: updatedAt });
  if (metaError) throw metaError;

  return {
    url: buildPublicUrl(supabase, path, updatedAt),
    updatedAt,
  };
}

async function deleteCompanyLogo() {
  const supabase = getSupabase();
  if (!supabase) {
    const err = new Error('Supabase non configuré');
    err.status = 503;
    throw err;
  }

  const meta = await getLogoMetadata(supabase);
  if (meta?.path) {
    await supabase.storage.from(BUCKET).remove([meta.path]);
  }
  await supabase.from('app_metadata').delete().eq('key', META_KEY);
  return { url: null, updatedAt: null };
}

module.exports = {
  getCompanyLogo,
  uploadCompanyLogo,
  deleteCompanyLogo,
};
