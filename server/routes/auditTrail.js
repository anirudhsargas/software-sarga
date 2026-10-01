const router = require('express').Router();
const { pool } = require('../database');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { asyncHandler } = require('../helpers');
const { readAuditRows, migrateMysqlAudit, MAX_ROWS } = require('../services/googleSheetsAuditService');

const isSet = v => v !== undefined && v !== '' && v !== 'all';
const dateText = v => v instanceof Date ? v.toISOString() : String(v || '');
function filteredRows(rows, q = {}) {
  const search = String(q.search || '').toLowerCase();
  return rows.filter(r => {
    if (search && ![r.username,r.employee_name,r.document_number,r.module,r.record_id,r.legacy_details,r.action_type].some(v => String(v || '').toLowerCase().includes(search))) return false;
    if (isSet(q.user_id) && String(r.user_id_internal) !== String(q.user_id)) return false;
    if (isSet(q.staff_id) && String(r.user_id_internal) !== String(q.staff_id)) return false;
    if (isSet(q.branch_id) && String(r.branch_id) !== String(q.branch_id)) return false;
    if (isSet(q.module) && r.module !== q.module) return false;
    const action = q.action || q.action_type;
    if (isSet(action) && r.action_type !== action && r.legacy_action !== action) return false;
    if (isSet(q.status) && ((q.status === 'success') !== Boolean(r.success))) return false;
    if (isSet(q.success) && String(Boolean(r.success)) !== String(q.success === '1' || q.success === 'true')) return false;
    if (isSet(q.record_id) && String(r.record_id) !== String(q.record_id)) return false;
    if (isSet(q.document_number) && !String(r.document_number || '').includes(q.document_number)) return false;
    const timestamp = dateText(r.timestamp);
    if (q.date_from && timestamp < q.date_from) return false;
    if (q.date_to && timestamp.slice(0,10) > q.date_to) return false;
    return true;
  });
}
const desc = (a,b) => dateText(b.timestamp).localeCompare(dateText(a.timestamp));
const asLegacy = r => ({ ...r, action: r.legacy_action || r.action_type, details: r.legacy_details || r.reason_remarks || '', entity_type: r.entity_type || r.record_type, entity_id: r.entity_id || r.record_id });

router.post('/audit/migrate-from-mysql', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (_req,res) => {
  const result = await migrateMysqlAudit(pool);
  res.json({success:true,...result,maxRows:MAX_ROWS,message:'Historical audit rows copied to Google Sheets. MySQL audit history was left unchanged.'});
}));

router.get('/audit/logs', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req,res) => {
  const page = Math.max(1, Number.parseInt(req.query.page || '1',10));
  const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit || '50',10)));
  const matches = filteredRows(await readAuditRows(), req.query).sort(desc);
  res.json({ success:true, data:matches.slice((page-1)*limit,page*limit), pagination:{page,limit,total:matches.length,totalPages:Math.ceil(matches.length/limit)} });
}));

router.get('/audit/logs/:id', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req,res) => {
  const rows = await readAuditRows();
  const row = rows.find(r => String(r.audit_id) === String(req.params.id) || String(r.id) === String(req.params.id));
  if (!row) return res.status(404).json({message:'Audit record not found'});
  res.json({success:true,data:row});
}));

router.get('/audit/stats', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (req,res) => {
  const now = new Date().toISOString().slice(0,10);
  const q = {...req.query};
  if (!q.date_from && !q.date_to) q.date_from = now, q.date_to = now;
  const rows = filteredRows(await readAuditRows(), q);
  const count = predicate => rows.filter(predicate).length;
  const group = key => Object.entries(rows.reduce((a,r)=>{const k=r[key]||'Unknown';a[k]=(a[k]||0)+1;return a;},{})).map(([k,n])=>({[key]:k,count:n})).sort((a,b)=>b.count-a.count).slice(0,10);
  const hourCounts = {};
  for (const r of rows) { const h=dateText(r.timestamp).slice(0,13)+':00'; hourCounts[h]=(hourCounts[h]||0)+1; }
  const failures = rows.filter(r=>!r.success);
  const errors = {};
  for(const r of failures){const k=[r.module,r.action_type,r.error_message].join('|');errors[k]=(errors[k]||0)+1;}
  const userCounts = new Map();
  for (const r of rows) { const id=String(r.user_id_internal||'unknown'); const value=userCounts.get(id)||{user_id_internal:r.user_id_internal,username:r.username,employee_name:r.employee_name,count:0};value.count++;userCounts.set(id,value); }
  res.json({success:true,data:{totalToday:rows.length,totalLogins:count(r=>/login/i.test(r.action_type||r.legacy_action||'')),failedLogins:count(r=>!r.success&&/login/i.test(r.action_type||r.legacy_action||'')),recordsCreated:count(r=>r.action_type==='Create'),recordsUpdated:count(r=>r.action_type==='Update'),recordsDeleted:count(r=>r.action_type==='Delete'),approvals:count(r=>['Approve','Reject'].includes(r.action_type)),mostActiveModules:group('module'),mostActiveUsers:[...userCounts.values()].sort((a,b)=>b.count-a.count).slice(0,10),hourlyActivity:Object.entries(hourCounts).map(([hour,n])=>({hour,count:n})),branchActivity:group('branch_name').map(x=>({branch:x.branch_name,count:x.count})),topErrors:Object.entries(errors).map(([key,n])=>{const [module,action_type,error_message]=key.split('|');return {module,action_type,error_message,count:n};}).sort((a,b)=>b.count-a.count).slice(0,10)}});
}));

router.get('/audit/filters', authenticateToken, authorizeRoles('Admin'), asyncHandler(async (_req,res) => {
  const rows=await readAuditRows();
  const unique=key=>[...new Set(rows.map(r=>r[key]).filter(Boolean))].sort();
  res.json({success:true,data:{modules:unique('module'),actions:[...new Set(rows.flatMap(r=>[r.action_type,r.legacy_action]).filter(Boolean))].sort(),users:[...new Map(rows.filter(r=>r.user_id_internal).map(r=>[String(r.user_id_internal),{user_id_internal:r.user_id_internal,username:r.username,employee_name:r.employee_name}])).values()],branches:[...new Map(rows.filter(r=>r.branch_id).map(r=>[String(r.branch_id),{branch_id:r.branch_id,branch_name:r.branch_name}])).values()]}});
}));

router.get('/audit/export', authenticateToken, authorizeRoles('Admin'), asyncHandler(async(req,res)=>{
  const {format='json'}=req.query;
  const data=filteredRows(await readAuditRows(),req.query).sort(desc).map(r=>({audit_id:r.audit_id,timestamp:r.timestamp,username:r.username,employee_name:r.employee_name,user_role:r.user_role,branch_name:r.branch_name,department:r.department,module:r.module,action_type:r.action_type||r.legacy_action,record_type:r.record_type||r.entity_type,record_id:r.record_id||r.entity_id,document_number:r.document_number,ip_address:r.ip_address,device_name:r.device_name,browser:r.browser,operating_system:r.operating_system,response_status:r.response_status,success:r.success?'Yes':'No',error_message:r.error_message,reason_remarks:r.reason_remarks||r.legacy_details,duration_ms:r.duration_ms,current_hash:r.current_hash,previous_hash:r.previous_hash}));
  const generatedAt=new Date().toISOString();
  if(format==='csv'){
    const fields=Object.keys(data[0]||{audit_id:''});
    const lines=[fields.join(','),...data.map(row=>fields.map(key=>`"${String(row[key]??'').replace(/"/g,'""')}"`).join(','))];
    res.setHeader('Content-Type','text/csv');res.setHeader('Content-Disposition',`attachment; filename=audit-log-${generatedAt.slice(0,10)}.csv`);return res.send(lines.join('\n'));
  }
  res.setHeader('Content-Disposition',`attachment; filename=audit-log-${generatedAt.slice(0,10)}.json`);
  res.json({generatedAt,generatedBy:req.user?.user_id||'Unknown',totalRecords:data.length,data});
}));

router.get('/audit/verify-chain', authenticateToken, authorizeRoles('Admin'), asyncHandler(async(_req,res)=>res.json({success:true,data:{supported:false,recordsChecked:0,chainIntact:null,violations:[],message:'Hash-chain verification is unavailable for Google Sheets audit storage.'}})));

router.get('/audit-logs', authenticateToken, authorizeRoles('Admin'), asyncHandler(async(req,res)=>{
  const page=Math.max(1,Number.parseInt(req.query.page||'1',10));const limit=Math.min(500,Math.max(1,Number.parseInt(req.query.limit||'50',10)));
  const q={...req.query};for(const [from,to] of [['startDate','date_from'],['endDate','date_to']])if(q[from])q[to]=q[from];
  if(q.entity_type)q.record_id=q.entity_id;
  let rows=filteredRows(await readAuditRows(),q).filter(r=>!q.entity_type||String(r.entity_type||r.record_type)===String(q.entity_type)).sort(desc).map(asLegacy);
  res.json({data:rows.slice((page-1)*limit,page*limit),pagination:{page,limit,total:rows.length,totalPages:Math.ceil(rows.length/limit)}});
}));
router.get('/audit-logs/entity/:type/:id', authenticateToken, authorizeRoles('Admin'), asyncHandler(async(req,res)=>{
  const rows=(await readAuditRows()).filter(r=>String(r.entity_type||r.record_type)===String(req.params.type)&&String(r.entity_id||r.record_id)===String(req.params.id)).sort(desc).slice(0,100).map(asLegacy);res.json(rows);
}));

module.exports=router;
