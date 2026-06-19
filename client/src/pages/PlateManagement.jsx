import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, useMemo } from 'react';
import { Layers, Loader2, Plus, Minus, Search, Maximize2, Hash, UserSquare, Calendar, X, RotateCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { optimizePlateLayout, findBestPlateSize, getFittingItems, MATERIAL_TYPES } from '../utils/nestingOptimizer';
import { PAPER_SIZES } from '../utils/paperOptimizer';
import PageContainer from '../components/ui/PageContainer';

const DUMMY_SLOTS_A5_CAPACITY = 8;
const SLOT_SIZES = {
    'A5': 1,
    'A4': 2,
    'A3': 4
};

const STANDARD_PLATE_SIZES = ['SRA3', 'SRA2', 'SRA1', 'A3', 'A2', 'A1', '13x19', '12x18'];

const PlateManagement = () => {
    useSEO('Plate Management');

    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedJobs, setSelectedJobs] = useState([]); // { job, selectedSize, allocatedSlots, width, height }
    
    // Plate configuration
    const [plateSize, setPlateSize] = useState('SRA3');
    const [customPlate, setCustomPlate] = useState({ width: '', height: '' });
    const [materialType, setMaterialType] = useState('paper');
    const [gutter, setGutter] = useState(5); // mm spacing between items
    const [allowRotation, setAllowRotation] = useState(true);
    const [showOnlyFitting, setShowOnlyFitting] = useState(false);
    const [autoOptimize, setAutoOptimize] = useState(false);
    const [viewMode, setViewMode] = useState('both'); // 'dummy', 'nesting', 'both'

    useEffect(() => {
        fetchJobs();
    }, []);

    const fetchJobs = async () => {
        try {
            const res = await api.get('/jobs/offset-pending');
            setJobs(res.data);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load Offset jobs");
        } finally {
            setLoading(false);
        }
    };

    const totalAllocatedSlots = useMemo(() => {
        return selectedJobs.reduce((sum, item) => sum + (item.allocatedSlots * SLOT_SIZES[item.selectedSize]), 0);
    }, [selectedJobs]);

    const isDummyFull = totalAllocatedSlots >= DUMMY_SLOTS_A5_CAPACITY;

    const dummyBreakdown = useMemo(() => {
        const breakdown = [];
        let requiredRunLength = 0;

        selectedJobs.forEach(item => {
            const equivalents = item.allocatedSlots * SLOT_SIZES[item.selectedSize];
            const runLength = Math.ceil(item.job.quantity / item.allocatedSlots);
            if (runLength > requiredRunLength) {
                requiredRunLength = runLength;
            }
            breakdown.push({
                ...item,
                equivalents,
                runLength
            });
        });

        return { breakdown, requiredRunLength };
    }, [selectedJobs]);

    // Get current plate dimensions
    const plateDimensions = useMemo(() => {
        if (plateSize === 'Custom') {
            return {
                width: Number(customPlate.width) || 0,
                height: Number(customPlate.height) || 0
            };
        }
        const size = PAPER_SIZES[plateSize];
        return size ? { width: size.w, height: size.h } : { width: 0, height: 0 };
    }, [plateSize, customPlate]);

    // Convert selected jobs to items for nesting
    const nestableItems = useMemo(() => {
        return selectedJobs.map(item => {
            const size = PAPER_SIZES[item.selectedSize];
            return {
                id: item.job.id,
                job: item.job,
                width: size ? size.w : 148,
                height: size ? size.h : 210,
                quantity: item.job.quantity,
                allocatedSlots: item.allocatedSlots
            };
        });
    }, [selectedJobs]);

    // Run nesting optimization
    const nestingResult = useMemo(() => {
        if (plateDimensions.width === 0 || plateDimensions.height === 0 || nestableItems.length === 0) {
            return null;
        }
        
        return optimizePlateLayout({
            plateWidth: plateDimensions.width,
            plateHeight: plateDimensions.height,
            items: nestableItems,
            allowRotation,
            gutter
        });
    }, [plateDimensions, nestableItems, allowRotation, gutter]);

    // Filter jobs that can fit on the plate
    const fittingJobs = useMemo(() => {
        if (plateDimensions.width === 0 || plateDimensions.height === 0) {
            return jobs;
        }
        
        const jobItems = jobs.map(job => {
            // Default to A5 size for filtering
            const size = PAPER_SIZES['A5'];
            return {
                job,
                width: size.w,
                height: size.h
            };
        });
        
        const fitting = getFittingItems(jobItems, plateDimensions.width, plateDimensions.height, allowRotation);
        return fitting.map(item => item.job);
    }, [jobs, plateDimensions, allowRotation]);

    const displayJobs = showOnlyFitting ? fittingJobs : jobs;

    const handleAddJobToPlate = (job) => {
        if (selectedJobs.find(j => j.job.id === job.id)) return;

        // Check if item can fit on plate
        const size = PAPER_SIZES['A5'];
        if (plateDimensions.width > 0 && plateDimensions.height > 0) {
            const canFit = size.w <= plateDimensions.width && size.h <= plateDimensions.height;
            if (!canFit) {
                toast.error("Item is too large for the selected plate size.");
                return;
            }
        }

        // Default to A5 requiring 1 slot
        if (totalAllocatedSlots + SLOT_SIZES['A5'] > DUMMY_SLOTS_A5_CAPACITY) {
            toast.error("Dummy plate is full. Cannot add more items.");
            return;
        }

        setSelectedJobs([...selectedJobs, { job, selectedSize: 'A5', allocatedSlots: 1 }]);
    };

    const handleRemoveJobFromPlate = (jobId) => {
        setSelectedJobs(selectedJobs.filter(j => j.job.id !== jobId));
    };

    const handleUpdateAllocation = (jobId, size, slots) => {
        const itemIndex = selectedJobs.findIndex(j => j.job.id === jobId);
        if (itemIndex === -1) return;

        const currentItem = selectedJobs[itemIndex];
        const newEquivalents = slots * SLOT_SIZES[size];
        const currentEquivalents = currentItem.allocatedSlots * SLOT_SIZES[currentItem.selectedSize];

        const spaceDelta = newEquivalents - currentEquivalents;

        if (totalAllocatedSlots + spaceDelta > DUMMY_SLOTS_A5_CAPACITY) {
            toast.error(`Not enough space on plate. Needs ${newEquivalents} A5-slots, but only ${DUMMY_SLOTS_A5_CAPACITY - totalAllocatedSlots + currentEquivalents} available.`);
            return;
        }

        const newSelected = [...selectedJobs];
        newSelected[itemIndex] = { ...currentItem, selectedSize: size, allocatedSlots: slots };
        setSelectedJobs(newSelected);
    };

    const filteredJobs = useMemo(() => {
        if (!search) return jobs;
        const lowSearch = search.toLowerCase();
        return jobs.filter(j =>
            (j.job_number && j.job_number.toLowerCase().includes(lowSearch)) ||
            (j.job_name && j.job_name.toLowerCase().includes(lowSearch)) ||
            (j.customer_name && j.customer_name.toLowerCase().includes(lowSearch))
        );
    }, [search, jobs]);

    return (
        <PageContainer>
            <div className="page-header">
                <div className="flex-1">
                    <h1 className="page-title"><Layers className="icon-lg text-primary" /> Plate Management (Ganging)</h1>
                    <p className="page-subtitle">Combine pending Offset jobs onto a Master Plate to calculate optimal run lengths with minimum wastage.</p>
                </div>
            </div>

            <div className="row gap-lg" style={{ alignItems: 'flex-start' }}>
                <div className="col-8">
                    {/* Plate Configuration */}
                    <div className="panel p-0 mb-16 overflow-hidden">
                        <div className="panel-header bg-surface-alt">
                            <h2 className="section-title m-0">Plate Configuration</h2>
                            <div className={`badge ${nestingResult?.wastePercent < 20 ? 'badge--success' : nestingResult?.wastePercent < 40 ? 'badge--warning' : 'badge--danger'}`}>
                                {nestingResult ? `${nestingResult.utilizationPercent}% Utilized` : 'No items'}
                            </div>
                        </div>

                        <div className="p-16 border-b">
                            <div className="row gap-lg" style={{ alignItems: 'flex-end' }}>
                                {/* Plate Size Selection */}
                                <div className="col-4">
                                    <label className="text-xs font-semibold text-muted mb-8 block">PLATE SIZE</label>
                                    <select
                                        className="input-field"
                                        value={plateSize}
                                        onChange={(e) => setPlateSize(e.target.value)}
                                    >
                                        {STANDARD_PLATE_SIZES.map(size => (
                                            <option key={size} value={size}>{PAPER_SIZES[size].label}</option>
                                        ))}
                                        <option value="Custom">Custom Size</option>
                                    </select>
                                </div>

                                {/* Custom Dimensions */}
                                {plateSize === 'Custom' && (
                                    <>
                                        <div className="col-2">
                                            <label className="text-xs font-semibold text-muted mb-8 block">WIDTH (mm)</label>
                                            <input
                                                type="number"
                                                className="input-field"
                                                placeholder="mm"
                                                value={customPlate.width}
                                                onChange={(e) => setCustomPlate(p => ({ ...p, width: e.target.value }))}
                                            />
                                        </div>
                                        <div className="col-2">
                                            <label className="text-xs font-semibold text-muted mb-8 block">HEIGHT (mm)</label>
                                            <input
                                                type="number"
                                                className="input-field"
                                                placeholder="mm"
                                                value={customPlate.height}
                                                onChange={(e) => setCustomPlate(p => ({ ...p, height: e.target.value }))}
                                            />
                                        </div>
                                    </>
                                )}

                                {/* Material Type */}
                                <div className="col-3">
                                    <label className="text-xs font-semibold text-muted mb-8 block">MATERIAL</label>
                                    <select
                                        className="input-field"
                                        value={materialType}
                                        onChange={(e) => setMaterialType(e.target.value)}
                                    >
                                        {Object.entries(MATERIAL_TYPES).map(([key, val]) => (
                                            <option key={key} value={key}>{val.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Gutter */}
                                <div className="col-2">
                                    <label className="text-xs font-semibold text-muted mb-8 block">GUTTER (mm)</label>
                                    <input
                                                type="number"
                                                className="input-field"
                                                min="0"
                                                step="1"
                                                value={gutter}
                                                onChange={(e) => setGutter(Number(e.target.value))}
                                            />
                                </div>

                                {/* Rotation Toggle */}
                                <div className="col-1">
                                    <label className="text-xs font-semibold text-muted mb-8 block">ROTATE</label>
                                    <button
                                        className={`btn btn-icon ${allowRotation ? 'btn-primary' : 'btn-secondary'}`}
                                                onClick={() => setAllowRotation(!allowRotation)}
                                                title={allowRotation ? 'Rotation enabled' : 'Rotation disabled'}
                                            >
                                        <RotateCw size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="p-16">
                            {selectedJobs.length === 0 ? (
                                <div className="text-center p-32 muted">
                                    <Layers size={48} className="mb-16 opacity-50" style={{ margin: '0 auto' }} />
                                    <p>No jobs added to plate yet.</p>
                                    <p className="text-sm">Click the <b>+</b> icon next to pending offset jobs below.</p>
                                </div>
                            ) : (
                                <div className="table-scroll">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Job</th>
                                                <th>Target Qty</th>
                                                <th>Print Size</th>
                                                <th>Slots Allocated</th>
                                                <th>Required Run</th>
                                                <th style={{ width: '40px' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dummyBreakdown.breakdown.map((item) => (
                                                <tr key={item.job.id}>
                                                    <td>
                                                        <div className="font-medium">{item.job.job_name}</div>
                                                        <div className="text-xs muted">{item.job.job_number}</div>
                                                    </td>
                                                    <td className="font-semibold">{item.job.quantity}</td>
                                                    <td>
                                                        <select
                                                            className="input-field"
                                                            style={{ padding: '4px 8px', height: '30px', width: '80px' }}
                                                            value={item.selectedSize}
                                                            onChange={(e) => handleUpdateAllocation(item.job.id, e.target.value, item.allocatedSlots)}
                                                        >
                                                            <option value="A5">A5</option>
                                                            <option value="A4">A4</option>
                                                            <option value="A3">A3</option>
                                                        </select>
                                                    </td>
                                                    <td>
                                                        <div className="row align-center gap-sm">
                                                            <button
                                                                className="btn btn-icon btn-secondary"
                                                                style={{ width: '28px', height: '28px' }}
                                                                onClick={() => handleUpdateAllocation(item.job.id, item.selectedSize, Math.max(1, item.allocatedSlots - 1))}
                                                            ><Minus size={14} /></button>
                                                            <span className="font-medium" style={{ width: '20px', textAlign: 'center' }}>{item.allocatedSlots}</span>
                                                            <button
                                                                className="btn btn-icon btn-secondary"
                                                                style={{ width: '28px', height: '28px' }}
                                                                onClick={() => handleUpdateAllocation(item.job.id, item.selectedSize, item.allocatedSlots + 1)}
                                                            ><Plus size={14} /></button>
                                                            <span className="text-xs muted ml-4">({item.equivalents} A5s)</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="badge badge--neutral">
                                                            {item.runLength} imp.
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <button className="btn btn-icon btn-ghost" onClick={() => handleRemoveJobFromPlate(item.job.id)}>
                                                            <X size={16} className="text-danger" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr className="bg-surface-alt font-medium">
                                                <td colSpan="4" className="text-right">Total Plate Run Needed:</td>
                                                <td colSpan="2" className="text-primary text-md">
                                                    {dummyBreakdown.requiredRunLength} Impressions
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* View Mode Toggle */}
                            <div className="mt-16 p-16 border rounded" style={{ backgroundColor: 'var(--surface)' }}>
                                <div className="row align-center justify-between mb-12">
                                    <h4 className="text-sm font-medium m-0">Visualization Mode</h4>
                                    <div className="row gap-xs">
                                        <button
                                            className={`btn btn-sm ${viewMode === 'dummy' ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() => setViewMode('dummy')}
                                        >
                                            Dummy Slots
                                        </button>
                                        <button
                                            className={`btn btn-sm ${viewMode === 'nesting' ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() => setViewMode('nesting')}
                                        >
                                            Advanced Layout
                                        </button>
                                        <button
                                            className={`btn btn-sm ${viewMode === 'both' ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() => setViewMode('both')}
                                        >
                                            Both Views
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Traditional Dummy Slots Visualization */}
                            {(viewMode === 'dummy' || viewMode === 'both') && (
                                <div className="mt-16 p-16 border rounded" style={{ backgroundColor: 'var(--surface)' }}>
                                    <h4 className="text-sm font-medium mb-12">Dummy Visualization (8 x A5 equivalents)</h4>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(4, 1fr)',
                                        gridAutoRows: '60px',
                                        gap: '4px',
                                        border: '1px solid var(--border)',
                                        padding: '4px',
                                        backgroundColor: 'var(--surface)'
                                    }}>
                                        {[...Array(DUMMY_SLOTS_A5_CAPACITY)].map((_, idx) => {
                                            // Find which job occupies this slot
                                            let currentCursor = 0;
                                            let occupiedJob = null;

                                            for (const item of dummyBreakdown.breakdown) {
                                                if (idx >= currentCursor && idx < currentCursor + item.equivalents) {
                                                    occupiedJob = item;
                                                    break;
                                                }
                                                currentCursor += item.equivalents;
                                            }

                                            return (
                                                <div key={idx} style={{
                                                    backgroundColor: occupiedJob ? 'var(--primary-light)' : 'var(--surface-alt)',
                                                    border: occupiedJob ? '1px solid var(--primary)' : '1px dashed var(--border)',
                                                    borderRadius: '4px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: occupiedJob ? 'var(--primary-dark)' : 'var(--text-muted)',
                                                    fontSize: '11px',
                                                    fontWeight: 'bold',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    padding: '4px'
                                                }}>
                                                    {occupiedJob ? occupiedJob.job.job_number : 'Empty A5'}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Advanced Plate Visualization */}
                            {(viewMode === 'nesting' || viewMode === 'both') && (
                                <div className="mt-16 p-16 border rounded" style={{ backgroundColor: 'var(--surface)' }}>
                                    <div className="row align-center justify-between mb-12">
                                        <h4 className="text-sm font-medium m-0">Plate Layout Visualization</h4>
                                        {nestingResult && (
                                            <div className="row gap-xs align-center">
                                                <span className="text-xs muted">Waste:</span>
                                                <span className={`text-xs font-bold ${nestingResult.wastePercent < 20 ? 'text-success' : nestingResult.wastePercent < 40 ? 'text-warning' : 'text-danger'}`}>
                                                    {nestingResult.wastePercent}%
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {nestingResult && plateDimensions.width > 0 ? (
                                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                                            <div style={{
                                                position: 'relative',
                                                border: '2px solid var(--border)',
                                                backgroundColor: 'var(--surface-alt)',
                                                // Scale to fit in container
                                                aspectRatio: `${plateDimensions.width}/${plateDimensions.height}`,
                                                width: '100%',
                                                maxWidth: '500px',
                                                minHeight: '200px'
                                            }}>
                                                {nestingResult.placedItems.map((item, idx) => {
                                                    const scale = 100 / plateDimensions.width; // percentage based
                                                    const left = (item.x / plateDimensions.width) * 100;
                                                    const top = (item.y / plateDimensions.height) * 100;
                                                    const width = (item.placedWidth / plateDimensions.width) * 100;
                                                    const height = (item.placedHeight / plateDimensions.height) * 100;
                                                    
                                                    // Generate color based on job id
                                                    const hue = (item.id * 137) % 360;
                                                    const bgColor = `hsl(${hue}, 70%, 85%)`;
                                                    const borderColor = `hsl(${hue}, 70%, 40%)`;
                                                    
                                                    return (
                                                        <div
                                                            key={item.id}
                                                            style={{
                                                                position: 'absolute',
                                                                left: `${left}%`,
                                                                top: `${top}%`,
                                                                width: `${width}%`,
                                                                height: `${height}%`,
                                                                backgroundColor: bgColor,
                                                                border: `2px solid ${borderColor}`,
                                                                borderRadius: '2px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontSize: '10px',
                                                                fontWeight: 'bold',
                                                                color: borderColor,
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                                padding: '2px'
                                                            }}
                                                            title={`${item.job.job_number} (${item.placedWidth}×${item.placedHeight}mm)${item.rotated ? ' [Rotated]' : ''}`}
                                                        >
                                                            {item.job.job_number}
                                                        </div>
                                                    );
                                                })}
                                                
                                                {nestingResult.failedItems.length > 0 && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        bottom: '4px',
                                                        right: '4px',
                                                        backgroundColor: 'var(--error)',
                                                        color: 'white',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        fontSize: '10px',
                                                        fontWeight: 'bold'
                                                    }}>
                                                        {nestingResult.failedItems.length} couldn't fit
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center p-16 muted text-sm">
                                            Add items and select a plate size to see layout
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Optimization Stats */}
                            {nestingResult && (
                                <div className="mt-16 p-16 border rounded" style={{ backgroundColor: 'var(--surface)' }}>
                                    <h4 className="text-sm font-medium mb-12">Optimization Statistics</h4>
                                    <div className="row gap-lg">
                                        <div className="col-4">
                                            <div className="text-xs muted mb-4">Items Placed</div>
                                            <div className="text-lg font-bold text-primary">{nestingResult.itemCount}</div>
                                        </div>
                                        <div className="col-4">
                                            <div className="text-xs muted mb-4">Failed to Fit</div>
                                            <div className={`text-lg font-bold ${nestingResult.failedCount > 0 ? 'text-danger' : 'text-success'}`}>
                                                {nestingResult.failedCount}
                                            </div>
                                        </div>
                                        <div className="col-4">
                                            <div className="text-xs muted mb-4">Utilization</div>
                                            <div className={`text-lg font-bold ${nestingResult.utilizationPercent >= 80 ? 'text-success' : nestingResult.utilizationPercent >= 60 ? 'text-warning' : 'text-danger'}`}>
                                                {nestingResult.utilizationPercent}%
                                            </div>
                                        </div>
                                    </div>
                                    {nestingResult.failedCount > 0 && (
                                        <div className="mt-12 p-8 bg-error-light rounded" style={{ backgroundColor: 'var(--error)10' }}>
                                            <div className="row align-center gap-xs text-danger text-sm">
                                                <AlertTriangle size={14} />
                                                <span>{nestingResult.failedCount} items couldn't fit. Try a larger plate or remove some items.</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="col-4">
                    <div className="panel p-0">
                        <div className="panel-header bg-surface-alt">
                            <h2 className="section-title m-0">Pending Offset Jobs</h2>
                        </div>
                        <div className="p-16 border-b">
                            <div className="search-bar w-full mb-8">
                                <Search className="search-icon" size={18} />
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="Search offset jobs..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                            <label className="row align-center gap-xs cursor-pointer text-sm">
                                <input
                                    type="checkbox"
                                    checked={showOnlyFitting}
                                    onChange={(e) => setShowOnlyFitting(e.target.checked)}
                                />
                                <span>Show only fitting items</span>
                                {showOnlyFitting && (
                                    <span className="badge badge--neutral ml-4">{fittingJobs.length}</span>
                                )}
                            </label>
                        </div>
                        <div className="list-group" style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
                            {loading ? (
                                <div className="p-32 text-center text-muted"><Loader2 className="animate-spin inline mr-8" size={16} /> Loading...</div>
                            ) : displayJobs.length === 0 ? (
                                <div className="p-32 text-center text-muted">No pending offset jobs found.</div>
                            ) : (
                                displayJobs.map(job => {
                                    const isAdded = selectedJobs.some(j => j.job.id === job.id);
                                    const canFit = !showOnlyFitting || fittingJobs.some(j => j.id === job.id);
                                    return (
                                        <div 
                                            key={job.id} 
                                            className={`list-item ${isAdded ? 'bg-surface-alt' : ''} ${!canFit ? 'opacity-50' : ''}`} 
                                            style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}
                                            title={!canFit ? 'Item too large for current plate' : ''}
                                        >
                                            <div className="flex-1 min-width-0 mr-8">
                                                <div className="font-semibold text-sm truncate">{job.job_name}</div>
                                                <div className="text-xs muted row align-center gap-xs mt-4">
                                                    <Hash size={12} /> {job.job_number}
                                                </div>
                                                <div className="text-xs muted row align-center gap-xs mt-2">
                                                    <UserSquare size={12} /> {job.customer_name}
                                                </div>
                                                <div className="row gap-xs mt-8">
                                                    <span className="badge badge--neutral">Qty: {job.quantity}</span>
                                                    {job.branch_name && <span className="badge badge--warning">{job.branch_name}</span>}
                                                </div>
                                            </div>
                                            <div>
                                                <button
                                                    className="btn btn-icon btn-secondary"
                                                    onClick={() => isAdded ? handleRemoveJobFromPlate(job.id) : handleAddJobToPlate(job)}
                                                    disabled={!isAdded && isDummyFull || !canFit}
                                                    title={isAdded ? "Remove from plate" : canFit ? "Add to plate" : "Item too large"}
                                                >
                                                    {isAdded ? <Minus size={16} /> : <Plus size={16} />}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </PageContainer>
    );
};

export default PlateManagement;
