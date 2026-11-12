USE donnasFlowerShop;

INSERT INTO employees (employee_code, first_name, last_name, phone, email, position, hire_date) VALUES
('EMP-001', 'Donna Bel', 'Suete', '09171234567', 'donnabel.suete@donzflowers.local', 'Shop Owner', '2024-01-15'),
('EMP-002', 'Mara', 'Reyes', '09181234567', 'mara.reyes@donzflowers.local', 'Flower Shop Employee', '2024-03-04'),
('EMP-003', 'Lina', 'Cruz', '09191234567', 'lina.cruz@donzflowers.local', 'Sales Staff', '2024-05-20')
ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), updated_at = CURRENT_TIMESTAMP;

INSERT INTO users (employee_id, username, password_hash, role) VALUES
((SELECT id FROM employees WHERE employee_code = 'EMP-001'), 'owner', '$2b$10$7bkaGvvg19RFxLo0CgSuyuEFSKpERGg/yNskk6Z29cpT.dz1Q3FlG', 'OWNER'),
((SELECT id FROM employees WHERE employee_code = 'EMP-002'), 'mara', '$2b$10$7bkaGvvg19RFxLo0CgSuyuEFSKpERGg/yNskk6Z29cpT.dz1Q3FlG', 'EMPLOYEE'),
((SELECT id FROM employees WHERE employee_code = 'EMP-003'), 'lina', '$2b$10$7bkaGvvg19RFxLo0CgSuyuEFSKpERGg/yNskk6Z29cpT.dz1Q3FlG', 'EMPLOYEE')
ON DUPLICATE KEY UPDATE role = VALUES(role), employee_id = VALUES(employee_id);

INSERT INTO categories (category_name, description) VALUES
('Fresh Flowers', 'Cut flowers for everyday sales'), ('Bouquets', 'Ready-made flower bouquets'), ('Flower Arrangements', 'Prepared floral arrangements'), ('Plants', 'Indoor and outdoor plants'), ('Gift Items', 'Gifts for flower occasions'), ('Accessories', 'Vases, ribbons, and wrapping materials')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO products (category_id, product_code, product_name, description, unit, cost_price, selling_price, stock_quantity, reorder_level) VALUES
((SELECT id FROM categories WHERE category_name='Fresh Flowers'), 'FLW-001', 'Red Rose', 'Long-stem red rose', 'stem', 35, 75, 120, 25),
((SELECT id FROM categories WHERE category_name='Fresh Flowers'), 'FLW-002', 'White Rose', 'Long-stem white rose', 'stem', 38, 80, 90, 20),
((SELECT id FROM categories WHERE category_name='Fresh Flowers'), 'FLW-003', 'Sunflower', 'Fresh yellow sunflower', 'stem', 45, 95, 65, 15),
((SELECT id FROM categories WHERE category_name='Fresh Flowers'), 'FLW-004', 'Tulip', 'Fresh tulip stem', 'stem', 55, 120, 40, 12),
((SELECT id FROM categories WHERE category_name='Bouquets'), 'BOU-001', 'Mixed Flower Bouquet', 'Seasonal mixed bouquet', 'bouquet', 450, 950, 12, 4),
((SELECT id FROM categories WHERE category_name='Bouquets'), 'BOU-002', 'Rose Bouquet', 'Classic dozen rose bouquet', 'bouquet', 650, 1400, 8, 3),
((SELECT id FROM categories WHERE category_name='Flower Arrangements'), 'ARR-001', 'Flower Arrangement', 'Tabletop arrangement', 'arrangement', 800, 1800, 6, 2),
((SELECT id FROM categories WHERE category_name='Accessories'), 'ACC-001', 'Decorative Vase', 'Clear decorative vase', 'piece', 180, 400, 18, 5),
((SELECT id FROM categories WHERE category_name='Accessories'), 'ACC-002', 'Ribbon', 'Decorative satin ribbon', 'roll', 40, 100, 35, 8),
((SELECT id FROM categories WHERE category_name='Accessories'), 'ACC-003', 'Wrapping Paper', 'Floral wrapping paper', 'sheet', 15, 45, 100, 20)
ON DUPLICATE KEY UPDATE product_name = VALUES(product_name), updated_at = CURRENT_TIMESTAMP;

INSERT INTO suppliers (supplier_code, supplier_name, contact_person, phone, email, address) VALUES
('SUP-001', 'Manila Bloom Growers', 'Ramon Dela Cruz', '09201234567', 'orders@manilabloom.local', 'Quezon City'),
('SUP-002', 'Garden Lane Wholesale', 'Ana Villanueva', '09211234567', 'sales@gardenlane.local', 'Makati City'),
('SUP-003', 'Petal Craft Supplies', 'Joey Navarro', '09221234567', 'hello@petalcraft.local', 'Pasig City')
ON DUPLICATE KEY UPDATE supplier_name = VALUES(supplier_name), updated_at = CURRENT_TIMESTAMP;
