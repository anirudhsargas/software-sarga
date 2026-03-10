import React, { useState, useEffect, useMemo } from 'react';
import { Layers, Loader2, Plus, Minus, Search, Maximize2, Hash, UserSquare, Calendar } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const DUMMY_SLOTS_A5_CAPACITY = 8;
const SLOT_SIZES = {
    'A5': 1,
    'A4': 2,
    'A3': 4
};

const PlateManagement = () => {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedJobs, setSelectedJobs] = useState([]); // { job, selectedSize, allocatedSlots }

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

    const handleAddJobToPlate = (job) => {
        if (selectedJobs.find(j => j.job.id === job.id)) return;

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
        <div className="page-container fade-in">
            <div className="page-header">
                <div className="flex-1">
                    <h1 className="page-title"><Layers className="icon-lg text-primary" /> Plate Management (Ganging)</h1>
                    <p className="page-subtitle">Combine pending Offset jobs onto a Master Plate to calculate optimal run lengths.</p>
                </div>
            </div>

            <div className="row gap-lg" style={{ alignItems: 'flex-start' }}>
                <div className="col-8">
                    {/* Active Plate Canvas */}
                    <div className="panel p-0 mb-16 overflow-hidden">
                        <div className="panel-header bg-surface-alt">
                            <h2 className="section-title m-0">Dummy Plate Configuration</h2>
                            <div className={`badge ${isDummyFull ? 'badge--danger' : 'badge--success'}`}>
                                {totalAllocatedSlots} / {DUMMY_SLOTS_A5_CAPACITY} A5 Slots Used
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

                            {/* Plate Visualization */}
                            <div className="mt-16 p-16 border rounded" style={{ backgroundColor: '#fdfdfd' }}>
                                <h4 className="text-sm font-medium mb-12">Dummy Visualization (8 x A5 equivalents)</h4>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(4, 1fr)',
                                    gridAutoRows: '60px',
                                    gap: '4px',
                                    border: '1px solid var(--border)',
                                    padding: '4px',
                                    backgroundColor: '#fff'
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
                        </div>
                    </div>
                </div>

                <div className="col-4">
                    <div className="panel p-0">
                        <div className="panel-header bg-surface-alt">
                            <h2 className="section-title m-0">Pending Offset Jobs</h2>
                        </div>
                        <div className="p-16 border-b">
                            <div className="search-bar w-full">
                                <Search className="search-icon" size={18} />
                                <input
                                    type="text"
                                    className="search-input"
                                    placeholder="Search offset jobs..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="list-group" style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
                            {loading ? (
                                <div className="p-32 text-center text-muted"><Loader2 className="animate-spin inline mr-8" size={16} /> Loading...</div>
                            ) : filteredJobs.length === 0 ? (
                                <div className="p-32 text-center text-muted">No pending offset jobs found.</div>
                            ) : (
                                filteredJobs.map(job => {
                                    const isAdded = selectedJobs.some(j => j.job.id === job.id);
                                    return (
                                        <div key={job.id} className={`list-item ${isAdded ? 'bg-surface-alt' : ''}`} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
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
                                                    disabled={!isAdded && isDummyFull}
                                                    title={isAdded ? "Remove from plate" : "Add to plate"}
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
        </div>
    );
};

export default PlateManagement;
