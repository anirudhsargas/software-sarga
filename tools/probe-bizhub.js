const path = require('path');
const snmp = require(path.join('D:/software sarga/server/node_modules/net-snmp'));

var host = '192.168.1.53';
var community = 'public';

var session = snmp.createSession(host, community, { version: snmp.Version2c, timeout: 5000, retries: 1 });

console.log('Walking printer MIB subtrees...');

// Walk the prtMarker subtree to find all counter OIDs
var found = [];
function walkSubtree(rootOid, label, cb) {
    session.subtree(rootOid, 20, function(varbinds) {
        varbinds.forEach(function(vb) {
            if (!snmp.isVarbindError(vb)) {
                found.push({ oid: vb.oid, val: vb.value.toString() });
                console.log('[' + label + ']', vb.oid, '->', vb.value.toString());
            }
        });
    }, function(err) {
        if (err) console.log('[' + label + '] walk error:', err.message);
        cb();
    });
}

walkSubtree('1.3.6.1.2.1.43', 'printerMIB', function() {
    walkSubtree('1.3.6.1.4.1.18334.1.1.1.1', 'KM-specific', function() {
        session.close();
        console.log('\nTotal found:', found.length, 'OIDs');
    });
});
