import re, os

def find_unused_destructured(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
        lines = content.split('\n')
    
    results = []
    
    target_vars = ['formRef', 'field', 'source', 'paperTypes', 'setSelectedPaperType', 
                   'mapSelectedToType', 'html5QrcodeModule', 'prevIsOpenRef', 'lastSyncText',
                   'getStatusBadge', 'spendTrend', 'latestPaymentDate', 'navigate', 
                   'formatCurrency', 'downloadInvoicePDF', 'machines', 'selectedProduct',
                   'extraInputs', 'setExtraInputs']
    
    found_in_file = set()
    for var in target_vars:
        count = len(re.findall(r'\b' + re.escape(var) + r'\b', content))
        if count == 1:
            for j, l2 in enumerate(lines):
                if re.search(r'\b' + re.escape(var) + r'\b', l2):
                    if var not in found_in_file:
                        results.append((j+1, var, l2.strip()))
                        found_in_file.add(var)
                    break
    
    return results

count = 0
for root, dirs, files in os.walk('client/src'):
    for fname in files:
        if not (fname.endswith('.js') or fname.endswith('.jsx')):
            continue
        fpath = os.path.join(root, fname)
        try:
            results = find_unused_destructured(fpath)
            for linenum, var, line in results:
                print(f"{fpath}:{linenum} ({var}): {line}")
                count += 1
        except:
            pass

print(f"\nTotal potential unused variables: {count}")
