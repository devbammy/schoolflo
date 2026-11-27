import { useEffect, useState } from 'react';
import { ImagePlus, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import useFeatureStore from '../../store/featureStore';

/**
 * The school's details for its printed report cards: address, email, phone
 * numbers, the logo (printed on both sides of the header) and the head's
 * signature (printed beside the head's comment).
 *
 * The school's name is not here: it is set at deployment (SCHOOL_NAME) and
 * shown on the sign-in page before anyone signs in.
 */
export default function SchoolDetailsPage() {
  const school = useFeatureStore((s) => s.school) || {};
  const refreshConfig = useFeatureStore((s) => s.load);
  const [form, setForm] = useState({ address: '', email: '', phones: '' });
  const [info, setInfo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');

  useEffect(() => {
    api
      .get('/school-settings')
      .then((res) => {
        const d = res.data.data;
        setInfo(d);
        setForm({ address: d.address, email: d.email, phones: d.phones });
      })
      .catch(() => toast.error('Could not load the school details'));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put('/school-settings', form);
      setInfo(res.data.data);
      toast.success(res.data.message);
      refreshConfig();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const upload = async (image, file) => {
    if (!file) return;
    setUploading(image);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api.put(`/school-settings/${image}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setInfo(res.data.data);
      toast.success(res.data.message);
      refreshConfig();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not upload');
    } finally {
      setUploading('');
    }
  };

  const remove = async (image) => {
    try {
      const res = await api.delete(`/school-settings/${image}`);
      setInfo(res.data.data);
      toast.success(res.data.message);
      refreshConfig();
    } catch {
      toast.error('Could not remove');
    }
  };

  const logoUrl = school.logoPath
    ? `${api.defaults.baseURL}${school.logoPath}`
    : null;

  const imageCard = (image, title, hint, has, preview) => (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <p
        style={{
          marginTop: 0,
          fontSize: '0.8125rem',
          color: 'var(--clr-text-3)',
        }}
      >
        {hint}
      </p>
      <div
        style={{
          height: 96,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px dashed var(--clr-border)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 12,
          color: 'var(--clr-text-3)',
          fontSize: '0.8125rem',
        }}
      >
        {preview ? (
          <img
            src={preview}
            alt={title}
            style={{ maxHeight: 84, maxWidth: '90%', objectFit: 'contain' }}
          />
        ) : has ? (
          'Uploaded'
        ) : (
          'None yet'
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label className="btn btn--secondary btn--sm" style={{ margin: 0 }}>
          <ImagePlus size={14} />
          {uploading === image ? 'Uploading…' : has ? 'Replace' : 'Upload'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            disabled={Boolean(uploading)}
            onChange={(e) => {
              upload(image, e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {has && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            style={{ color: 'var(--clr-danger)' }}
            onClick={() => remove(image)}
          >
            <Trash2 size={14} /> Remove
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">School Details</h1>
          <p className="page-header__subtitle">
            Printed at the top and foot of every report card
            {school.name ? ` for ${school.name}` : ''}
          </p>
        </div>
      </div>

      <form
        className="card"
        style={{ padding: 18, marginBottom: 20 }}
        onSubmit={save}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(260px, 100%), 1fr))',
            gap: 16,
          }}
        >
          <div
            className="form-group"
            style={{ marginBottom: 0, gridColumn: '1 / -1' }}
          >
            <label htmlFor="sd-address">Address</label>
            <input
              id="sd-address"
              className="form-control"
              maxLength={200}
              value={form.address}
              onChange={(e) =>
                setForm((f) => ({ ...f, address: e.target.value }))
              }
              placeholder="Plot 284 Glory and Praise Avenue, Kuchiako Layout, Kuje - Abuja"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="sd-email">Email</label>
            <input
              id="sd-email"
              type="email"
              className="form-control"
              maxLength={120}
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="sd-phones">Phone numbers</label>
            <input
              id="sd-phones"
              className="form-control"
              maxLength={120}
              value={form.phones}
              onChange={(e) =>
                setForm((f) => ({ ...f, phones: e.target.value }))
              }
              placeholder="08055335170, 08065371493"
            />
          </div>
        </div>
        <button
          type="submit"
          className="btn btn--primary"
          style={{ marginTop: 16 }}
          disabled={saving || !info}
        >
          <Save size={16} /> {saving ? 'Saving…' : 'Save details'}
        </button>
      </form>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
          gap: 20,
        }}
      >
        {imageCard(
          'logo',
          'School logo',
          'Printed on both sides of the report card header. PNG, JPEG or WebP, up to 1 MB.',
          info?.hasLogo,
          logoUrl,
        )}
        {imageCard(
          'signature',
          "Head's signature or stamp",
          "Printed beside the head's comment. It is never published at a web address; it only appears inside a report card.",
          info?.hasSignature,
          null,
        )}
      </div>
    </>
  );
}
