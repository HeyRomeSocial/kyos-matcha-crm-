import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Upload, Download, Trash2, Image, FileText, Film, File } from 'lucide-react'
import toast from 'react-hot-toast'

function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase()
  if (['jpg','jpeg','png','webp','svg','gif'].includes(ext)) return <Image size={20} className="text-blue-400" />
  if (['pdf'].includes(ext)) return <FileText size={20} className="text-red-400" />
  if (['mp4','mov','avi'].includes(ext)) return <Film size={20} className="text-purple-400" />
  return <File size={20} className="text-gray-400" />
}

function formatSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export default function BrandAssets() {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  async function load() {
    const { data, error } = await supabase.storage.from('brand-assets').list('', {
      sortBy: { column: 'created_at', order: 'desc' }
    })
    if (error) {
      toast.error('Could not load assets — make sure the brand-assets bucket exists in Supabase Storage')
      setAssets([])
    } else {
      setAssets((data || []).filter(f => f.name !== '.emptyFolderPlaceholder'))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleUpload(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    for (const file of files) {
      const { error } = await supabase.storage.from('brand-assets').upload(file.name, file, { upsert: true })
      if (error) toast.error(`Failed to upload ${file.name}: ${error.message}`)
    }
    toast.success(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`)
    setUploading(false)
    load()
    e.target.value = ''
  }

  async function deleteAsset(name) {
    const { error } = await supabase.storage.from('brand-assets').remove([name])
    if (error) toast.error(error.message)
    else { toast.success('Deleted'); load() }
  }

  function getUrl(name) {
    const { data } = supabase.storage.from('brand-assets').getPublicUrl(name)
    return data.publicUrl
  }

  const images = assets.filter(a => ['jpg','jpeg','png','webp','svg','gif'].some(e => a.name.toLowerCase().endsWith(e)))
  const others = assets.filter(a => !['jpg','jpeg','png','webp','svg','gif'].some(e => a.name.toLowerCase().endsWith(e)))

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Brand Assets</h1>
          <p className="text-sm text-gray-500 mt-0.5">{assets.length} files stored · logos, templates, photos</p>
        </div>
        <label className={`btn-primary cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
          <Upload size={15} />
          {uploading ? 'Uploading…' : 'Upload Files'}
          <input type="file" multiple className="hidden" onChange={handleUpload} accept="image/*,.pdf,.ai,.eps,.svg,.zip" />
        </label>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
      ) : assets.length === 0 ? (
        <div className="card p-12 text-center border-dashed border-2 border-gray-200">
          <Image size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">No brand assets yet</p>
          <p className="text-xs text-gray-400 mt-1 mb-4">Upload logos, photos, templates, and other brand files</p>
          <label className="btn-primary mx-auto cursor-pointer">
            <Upload size={14} /> Upload your first file
            <input type="file" multiple className="hidden" onChange={handleUpload} />
          </label>
        </div>
      ) : (
        <>
          {/* Image gallery */}
          {images.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Images</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {images.map(asset => (
                  <div key={asset.name} className="card overflow-hidden group">
                    <div className="aspect-square bg-gray-50 overflow-hidden">
                      <img
                        src={getUrl(asset.name)}
                        alt={asset.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    </div>
                    <div className="p-3">
                      <p className="text-xs font-medium text-gray-900 truncate">{asset.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatSize(asset.metadata?.size)}</p>
                      <div className="flex gap-2 mt-2">
                        <a
                          href={getUrl(asset.name)}
                          download={asset.name}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-xs text-center py-1 bg-[#EEF3EC] text-[#3D6034] rounded-lg hover:bg-[#d8e8d4] transition-colors"
                        >
                          Download
                        </a>
                        <button
                          onClick={() => deleteAsset(asset.name)}
                          className="px-2 py-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Other files */}
          {others.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Files</h2>
              <div className="card divide-y divide-gray-50">
                {others.map(asset => (
                  <div key={asset.name} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/50">
                    {fileIcon(asset.name)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{asset.name}</p>
                      <p className="text-xs text-gray-400">{formatSize(asset.metadata?.size)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={getUrl(asset.name)}
                        download={asset.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[#3D6034] hover:underline"
                      >
                        <Download size={13} /> Download
                      </a>
                      <button onClick={() => deleteAsset(asset.name)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
