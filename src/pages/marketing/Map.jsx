import React, { useEffect, useState, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../../lib/supabase'
import { Search, X, Loader, MapPin, Plus, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

// Fix Leaflet default marker icon issue with Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Custom coloured marker icons
function makeIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:14px;height:14px;
      background:${color};
      border:2.5px solid white;
      border-radius:50%;
      box-shadow:0 1px 4px rgba(0,0,0,0.3)
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  })
}

const ICONS = {
  active:      makeIcon('#3D6034'),
  sample_sent: makeIcon('#a855f7'),
  prospect:    makeIcon('#3b82f6'),
  outreach:    makeIcon('#f59e0b'),
  lead:        makeIcon('#6b7280'),
}

// Geocode a location string via Nominatim (OpenStreetMap) — free, no key needed
async function geocode(query) {
  if (!query?.trim()) return null
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', UK')}&format=json&limit=1`
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
    const data = await res.json()
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name }
  } catch {}
  return null
}

// Query Overpass API for cafes near a location
async function searchCafesNear(lat, lng, radiusKm = 3) {
  const r = radiusKm * 1000
  const query = `
    [out:json][timeout:15];
    (
      node["amenity"="cafe"](around:${r},${lat},${lng});
      node["amenity"="coffee_shop"](around:${r},${lat},${lng});
    );
    out body;
  `
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    })
    const data = await res.json()
    return (data.elements || []).filter(e => e.tags?.name).map(e => ({
      id: e.id,
      name: e.tags.name,
      lat: e.lat,
      lng: e.lon,
      address: [e.tags['addr:street'], e.tags['addr:city']].filter(Boolean).join(', ') || '',
      website: e.tags.website || '',
    }))
  } catch {
    return []
  }
}

// Helper to fly map to a location
function FlyTo({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (coords) map.flyTo([coords.lat, coords.lng], 13, { duration: 1.2 })
  }, [coords])
  return null
}

export default function MapPage() {
  const navigate = useNavigate()
  const [partners, setPartners] = useState([])
  const [outreachItems, setOutreachItems] = useState([])
  const [partnerPins, setPartnerPins] = useState([])
  const [outreachPins, setOutreachPins] = useState([])
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [geocoding, setGeocoding] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [flyTo, setFlyTo] = useState(null)
  const [showLayers, setShowLayers] = useState({ partners: true, outreach: true, leads: true })
  const [sidebarTab, setSidebarTab] = useState('search') // 'search' | 'layers'

  // Load data
  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: o }] = await Promise.all([
        supabase.from('partners').select('id,name,status,contact_name,email,address,total_kg,price_per_kg'),
        supabase.from('outreach').select('id,business_name,status,location,contact_name,email'),
      ])
      setPartners(p || [])
      setOutreachItems(o || [])
      setLoading(false)

      // Geocode partners with addresses (rate-limit: 1/sec)
      const withAddr = (p || []).filter(x => x.address?.trim())
      const pins = []
      for (const partner of withAddr.slice(0, 30)) { // limit to 30 to avoid hammering Nominatim
        const coords = await geocode(partner.address)
        if (coords) pins.push({ ...partner, lat: coords.lat, lng: coords.lng })
        await new Promise(r => setTimeout(r, 1100)) // respect Nominatim rate limit
      }
      setPartnerPins(pins)

      // Geocode outreach locations
      const oPins = []
      for (const item of (o || []).filter(x => x.location?.trim()).slice(0, 20)) {
        const coords = await geocode(item.location)
        if (coords) oPins.push({ ...item, lat: coords.lat, lng: coords.lng })
        await new Promise(r => setTimeout(r, 1100))
      }
      setOutreachPins(oPins)
    }
    load()
  }, [])

  // Search for cafe leads via Overpass
  async function handleSearch(e) {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setSearching(true)
    setLeads([])
    const coords = await geocode(searchQuery)
    if (!coords) {
      toast.error(`Couldn't find "${searchQuery}" — try a city name like "Manchester"`)
      setSearching(false)
      return
    }
    setFlyTo(coords)
    const cafes = await searchCafesNear(coords.lat, coords.lng, 3)
    setLeads(cafes)
    setSearching(false)
    if (cafes.length === 0) toast('No cafes found nearby — try a larger city or different area')
    else toast.success(`Found ${cafes.length} cafes near ${searchQuery}`)
  }

  async function addToOutreach(lead) {
    const { error } = await supabase.from('outreach').insert({
      business_name: lead.name,
      location: searchQuery,
      status: 'to_contact',
      channel: 'other',
      notes: lead.address || '',
    })
    if (error) toast.error(error.message)
    else toast.success(`${lead.name} added to Outreach!`)
  }

  return (
    <div className="flex gap-5 h-[calc(100vh-6rem)] max-w-7xl">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">UK Partner Map</h1>
          <p className="text-sm text-gray-500 mt-0.5">Find cafe leads and visualise your network</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
          {[['search','Find Leads'],['layers','Layers']].map(([id,label]) => (
            <button
              key={id}
              onClick={() => setSidebarTab(id)}
              className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${sidebarTab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {sidebarTab === 'search' && (
          <div className="flex flex-col gap-4 flex-1 min-h-0">
            {/* Search box */}
            <form onSubmit={handleSearch}>
              <label className="label">Search for cafes near a UK city</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className="input pl-8 text-sm"
                    placeholder="e.g. Manchester, Leeds…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={searching} className="btn-primary px-3">
                  {searching ? <Loader size={14} className="animate-spin" /> : <Search size={14} />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Shows cafes within 3km radius via OpenStreetMap</p>
            </form>

            {/* Lead results */}
            {leads.length > 0 && (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                <p className="text-xs font-medium text-gray-500">{leads.length} cafes found near {searchQuery}</p>
                {leads.map(lead => (
                  <div
                    key={lead.id}
                    className="card p-3 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => setFlyTo({ lat: lead.lat, lng: lead.lng })}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{lead.name}</p>
                        {lead.address && <p className="text-xs text-gray-400 mt-0.5 truncate">{lead.address}</p>}
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); addToOutreach(lead) }}
                        className="flex-shrink-0 p-1.5 bg-[#EEF3EC] text-[#3D6034] rounded-lg hover:bg-[#d8e8d4] transition-colors"
                        title="Add to Outreach"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {leads.length === 0 && !searching && (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                <MapPin size={28} className="text-gray-200 mb-3" />
                <p className="text-sm text-gray-400 font-medium">Search a UK city</p>
                <p className="text-xs text-gray-300 mt-1">We'll find cafes nearby you can reach out to</p>
              </div>
            )}
          </div>
        )}

        {sidebarTab === 'layers' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">Toggle map layers on/off</p>
            {[
              { id: 'partners', label: 'Existing Partners', color: '#3D6034', count: partnerPins.length, sub: 'active, sample sent, prospect' },
              { id: 'outreach', label: 'Outreach Prospects', color: '#f59e0b', count: outreachPins.length, sub: 'from your outreach pipeline' },
              { id: 'leads', label: 'Discovered Leads', color: '#6b7280', count: leads.length, sub: 'from your last search' },
            ].map(layer => (
              <label key={layer.id} className="flex items-center gap-3 p-3 card cursor-pointer hover:bg-gray-50">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: layer.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{layer.label}</p>
                  <p className="text-xs text-gray-400">{layer.count} pins · {layer.sub}</p>
                </div>
                <div
                  onClick={() => setShowLayers(l => ({ ...l, [layer.id]: !l[layer.id] }))}
                  className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${showLayers[layer.id] ? 'bg-[#3D6034]' : 'bg-gray-200'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${showLayers[layer.id] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </label>
            ))}

            {/* Legend */}
            <div className="card p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Legend</p>
              {[
                { color: '#3D6034', label: 'Active partner' },
                { color: '#a855f7', label: 'Sample sent' },
                { color: '#3b82f6', label: 'Prospect' },
                { color: '#f59e0b', label: 'Outreach target' },
                { color: '#6b7280', label: 'Discovered lead' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full border-2 border-white shadow" style={{ backgroundColor: l.color }} />
                  <span className="text-xs text-gray-600">{l.label}</span>
                </div>
              ))}
            </div>

            {geocoding && (
              <p className="text-xs text-gray-400 text-center">Geocoding partner addresses…</p>
            )}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-[#3D6034] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-400">Loading map…</p>
            </div>
          </div>
        ) : (
          <MapContainer
            center={[54.5, -3.5]}
            zoom={6}
            style={{ width: '100%', height: '100%' }}
            zoomControl={true}
          >
            <TileLayer
              attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {flyTo && <FlyTo coords={flyTo} />}

            {/* Partner pins */}
            {showLayers.partners && partnerPins.map(p => (
              <Marker key={p.id} position={[p.lat, p.lng]} icon={ICONS[p.status] || ICONS.prospect}>
                <Popup>
                  <div style={{ minWidth: '180px' }}>
                    <p style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>{p.name}</p>
                    {p.contact_name && <p style={{ fontSize: '12px', color: '#6b7280' }}>👤 {p.contact_name}</p>}
                    {p.email && <p style={{ fontSize: '12px', color: '#6b7280' }}>✉ {p.email}</p>}
                    {p.total_kg && p.price_per_kg && (
                      <p style={{ fontSize: '12px', color: '#3D6034', fontWeight: 600, marginTop: '4px' }}>
                        £{(p.total_kg * p.price_per_kg).toFixed(0)} all-time revenue
                      </p>
                    )}
                    <p style={{ fontSize: '11px', color: '#a855f7', marginTop: '2px', textTransform: 'capitalize' }}>
                      {p.status?.replace('_', ' ')}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Outreach pins */}
            {showLayers.outreach && outreachPins.map(o => (
              <Marker key={o.id} position={[o.lat, o.lng]} icon={ICONS.outreach}>
                <Popup>
                  <div style={{ minWidth: '160px' }}>
                    <p style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>{o.business_name}</p>
                    {o.contact_name && <p style={{ fontSize: '12px', color: '#6b7280' }}>👤 {o.contact_name}</p>}
                    <p style={{ fontSize: '11px', color: '#f59e0b', marginTop: '2px', textTransform: 'capitalize' }}>
                      {o.status?.replace(/_/g, ' ')}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Discovered leads */}
            {showLayers.leads && leads.map(lead => (
              <Marker key={lead.id} position={[lead.lat, lead.lng]} icon={ICONS.lead}>
                <Popup>
                  <div style={{ minWidth: '160px' }}>
                    <p style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>{lead.name}</p>
                    {lead.address && <p style={{ fontSize: '12px', color: '#6b7280' }}>{lead.address}</p>}
                    <button
                      onClick={() => addToOutreach(lead)}
                      style={{
                        marginTop: '8px', padding: '4px 10px', background: '#3D6034',
                        color: 'white', border: 'none', borderRadius: '6px',
                        fontSize: '11px', cursor: 'pointer', width: '100%'
                      }}
                    >
                      + Add to Outreach
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>
    </div>
  )
}
