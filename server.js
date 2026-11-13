const express = require('express');
const fs = require('fs');
const csv = require('csv-parser');

const app = express();
const PORT = 3300;

// Muudab JSON-vastuse ilusaks ja trepituks (Pretty Print)
app.set('json spaces', 2);

// In-memory storage
let spareParts = [];
let csvLoaded = false;

// Column mapping (based on your data)
const COLUMNS = {
  sn: 0,           // "00002356517"
  name: 1,         // "Valuveljed"
  stock1: 2,       // "0"
  stock2: 3,       // "0"
  stock3: 4,       // "0"
  stock4: 5,       // "0"
  stock5: 6,       // "0"
  unknown1: 7,     // ""
  price: 8,        // "90,833"
  manufacturer: 9, // "KIA"
  price2: 10       // "109"
};

// Helper: Convert price string ("90,833") to float (90.833)
function parsePrice(priceStr) {
  if (!priceStr) return 0;
  const cleaned = String(priceStr).replace(',', '.').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Load CSV on server start
function loadCSV() {
  // Using 'latin1' encoding to fix broken Estonian characters (ü, ä, ö)
  const readStream = fs.createReadStream('./projekt/data/LE.txt', { encoding: 'latin1' });
  
  readStream
    .pipe(csv({ 
      separator: '\t',        // TAB-separated
      headers: false          // No header row
    }))
    .on('data', (row) => {
      const rowArray = Object.values(row);
      
      const sparePart = {
        sn: (rowArray[COLUMNS.sn] || '').trim(),
        name: (rowArray[COLUMNS.name] || '').trim(),
        price: parsePrice(rowArray[COLUMNS.price]),
        manufacturer: (rowArray[COLUMNS.manufacturer] || '').trim(),
        price2: parsePrice(rowArray[COLUMNS.price2])
      };
      
      spareParts.push(sparePart);
    })
    .on('end', () => {
      csvLoaded = true;
      console.log(`✅ CSV loaded: ${spareParts.length} spare parts`);
    })
    .on('error', (err) => {
      console.error('❌ Error reading CSV:', err);
    });
}

// Helper: Filter data
function filterData(data, filters) {
  return data.filter(item => {
    if (filters.name && !item.name.toLowerCase().includes(filters.name.toLowerCase())) {
      return false;
    }
    if (filters.sn && !item.sn.toLowerCase().includes(filters.sn.toLowerCase())) {
      return false;
    }
    return true;
  });
}

// Helper: Sort data
function sortData(data, sortBy) {
  if (!sortBy) return data;
  
  const descending = sortBy.startsWith('-');
  const column = descending ? sortBy.slice(1) : sortBy;
  
  const sorted = [...data].sort((a, b) => {
    const aVal = a[column];
    const bVal = b[column];

    // Handle missing/undefined columns safely
    if (aVal === undefined || bVal === undefined) return 0;
    
    // Numeric comparison (for price, price2)
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return descending ? bVal - aVal : aVal - bVal;
    }
    
    // String comparison (for name, sn, manufacturer)
    const aStr = String(aVal).toLowerCase();
    const bStr = String(bVal).toLowerCase();
    if (aStr < bStr) return descending ? 1 : -1;
    if (aStr > bStr) return descending ? -1 : 1;
    return 0;
  });
  
  return sorted;
}

// Helper: Paginate data
function paginateData(data, page = 1, pageSize = 30) {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const start = (pageNum - 1) * pageSize;
  const end = start + pageSize;
  
  return {
    data: data.slice(start, end),
    page: pageNum,
    pageSize: pageSize,
    total: data.length,
    totalPages: Math.ceil(data.length / pageSize)
  };
}

// ===== ENDPOINTS =====

// GET /spare-parts - All data with filtering, sorting, pagination
app.get('/spare-parts', (req, res) => {
  if (!csvLoaded) {
    return res.status(503).json({ error: 'CSV still loading...' });
  }
  
  const { name, sn, sort, page = 1 } = req.query;
  
  // Apply filters
  let result = filterData(spareParts, { name, sn });
  
  // Apply sorting
  result = sortData(result, sort);
  
  // Apply pagination
  const paginated = paginateData(result, page, 30);
  
  res.json(paginated);
});

// GET /spare-parts/:sn - Get single part by sn
app.get('/spare-parts/:sn', (req, res) => {
  if (!csvLoaded) {
    return res.status(503).json({ error: 'CSV still loading...' });
  }
  
  const part = spareParts.find(p => p.sn === req.params.sn);
  
  if (!part) {
    return res.status(404).json({ error: 'Part not found' });
  }
  
  res.json(part);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: csvLoaded ? 'ready' : 'loading',
    spareParts: spareParts.length
  });
});

// Start server
loadCSV();

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
