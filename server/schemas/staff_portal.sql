CREATE TABLE IF NOT EXISTS sarga_staff_leaves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id_internal INT NOT NULL,
    leave_type VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL,
    attachment_url VARCHAR(255),
    status ENUM('Pending', 'Approved', 'Rejected', 'Cancelled') DEFAULT 'Pending',
    reviewed_by INT DEFAULT NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id_internal) REFERENCES sarga_staff(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES sarga_staff(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sarga_tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assigned_to INT NOT NULL,
    assigned_by INT NOT NULL,
    due_date DATE,
    status ENUM('Assigned', 'In Progress', 'Completed', 'Overdue') DEFAULT 'Assigned',
    priority ENUM('Low', 'Medium', 'High', 'Urgent') DEFAULT 'Medium',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_to) REFERENCES sarga_staff(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES sarga_staff(id) ON DELETE CASCADE
);
