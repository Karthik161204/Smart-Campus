import os
from flask import Flask, request, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = 'smart-campus-secret'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///smart_campus.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# ─── MODELS ───
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20), nullable=False) # admin, staff, user

class Issue(db.Model):
    id = db.Column(db.String(20), primary_key=True) # e.g. ISS-1234
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(50), nullable=False)
    location = db.Column(db.String(100), nullable=False)
    priority = db.Column(db.String(20), nullable=False)
    status = db.Column(db.String(20), default='Reported')
    reported_by = db.Column(db.String(120), nullable=False) # email
    assigned_to = db.Column(db.String(100)) # Staff Name
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    image = db.Column(db.Text) # Base64 string
    after_image = db.Column(db.Text) # Base64 string

class Notification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_email = db.Column(db.String(120), nullable=False)
    message = db.Column(db.String(200), nullable=False)
    issue_id = db.Column(db.String(20), nullable=False)
    title = db.Column(db.String(100), nullable=False)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# ─── AUTH ENDPOINTS ───
@app.route('/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(email=data.get('email')).first()
    
    if user and check_password_hash(user.password, data.get('password')):
        if user.role != data.get('role'):
             return jsonify({'error': 'Incorrect role selected'}), 401
        
        session['user_id'] = user.id
        session['user_name'] = user.name
        session['user_email'] = user.email
        session['user_role'] = user.role
        
        return jsonify({
            'id': user.id,
            'name': user.name,
            'email': user.email,
            'role': user.role
        })
    
    return jsonify({'error': 'Invalid credentials'}), 401

@app.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out'})

@app.route('/api/auth/me', methods=['GET'])
def get_me():
    if 'user_id' not in session:
        return jsonify({'error': 'Not logged in'}), 401
    return jsonify({
        'name': session['user_name'],
        'email': session['user_email'],
        'role': session['user_role']
    })

# ─── ISSUE ENDPOINTS ───
@app.route('/api/issues', methods=['GET'])
def get_issues():
    issues = Issue.query.order_by(Issue.created_at.desc()).all()
    return jsonify([{
        'id': i.id,
        'title': i.title,
        'description': i.description,
        'category': i.category,
        'location': i.location,
        'priority': i.priority,
        'status': i.status,
        'reportedBy': i.reported_by,
        'assignedTo': i.assigned_to,
        'createdAt': i.created_at.isoformat(),
        'image': i.image,
        'afterImage': i.after_image
    } for i in issues])

@app.route('/api/issues', methods=['POST'])
def create_issue():
    data = request.json
    new_issue = Issue(
        id=data.get('id'),
        title=data.get('title'),
        description=data.get('description'),
        category=data.get('category'),
        location=data.get('location'),
        priority=data.get('priority'),
        reported_by=data.get('reportedBy'),
        image=data.get('image')
    )
    db.session.add(new_issue)
    db.session.commit()
    return jsonify({'message': 'Issue created'}), 201

@app.route('/api/issues/<issue_id>', methods=['PUT'])
def update_issue(issue_id):
    issue = Issue.query.get(issue_id)
    if not issue:
        return jsonify({'error': 'Not found'}), 404
    
    data = request.json
    if 'status' in data: 
        old_status = issue.status
        issue.status = data['status']
        # Trigger Notification when issue is resolved
        if issue.status == 'Resolved' and old_status != 'Resolved':
            notif = Notification(
                user_email=issue.reported_by,
                message=f"Your issue '{issue.title}' has been resolved",
                issue_id=issue.id,
                title=issue.title
            )
            db.session.add(notif)
            
    if 'assignedTo' in data: issue.assigned_to = data['assignedTo']
    if 'afterImage' in data: issue.after_image = data['afterImage']
    
    db.session.commit()
    return jsonify({'message': 'Issue updated'})

# ─── NOTIFICATION ENDPOINTS ───
@app.route('/notifications', methods=['GET'])
def get_notifications():
    if 'user_email' not in session:
        return jsonify({'error': 'Not logged in'}), 401
    
    notifs = Notification.query.filter_by(user_email=session['user_email']).order_by(Notification.created_at.desc()).all()
    return jsonify([{
        'id': n.id,
        'message': n.message,
        'issue_id': n.issue_id,
        'title': n.title,
        'isRead': n.is_read,
        'createdAt': n.created_at.isoformat()
    } for n in notifs])

@app.route('/notifications/<int:notif_id>/read', methods=['PUT'])
def mark_read(notif_id):
    notif = Notification.query.get(notif_id)
    if notif:
        notif.is_read = True
        db.session.commit()
    return jsonify({'message': 'Marked as read'})

# ─── STATS ───
@app.route('/api/stats', methods=['GET'])
def get_stats():
    total = Issue.query.count()
    pending = Issue.query.filter(Issue.status != 'Resolved', Issue.status != 'Closed').count()
    resolved = Issue.query.filter_by(status='Resolved').count()
    return jsonify({
        'total': total,
        'pending': pending,
        'resolved': resolved
    })

# ─── DB SEEDING ───
def seed_db():
    if User.query.first(): return # Already seeded
    
    # Static demo accounts
    users = [
        User(email='admin@campus.edu',   password=generate_password_hash('admin123'), name='Admin User', role='admin'),
        User(email='student@campus.edu', password=generate_password_hash('user123'),  name='Karthik Raj', role='user'),
        User(email='rajesh@campus.edu',  password=generate_password_hash('staff123'), name='Rajesh Kumar', role='staff'),
        User(email='priya@campus.edu',   password=generate_password_hash('staff123'), name='Priya Sharma', role='staff'),
        User(email='arjun@campus.edu',   password=generate_password_hash('staff123'), name='Arjun Singh',  role='staff'),
    ]
    
    # Mock data for issues
    issues = [
        Issue(id='ISS-9402', title='Power Outage', description='No power in Block A Room 201', category='Electrical', location='Block A', priority='Critical', status='Assigned', reported_by='student@campus.edu', assigned_to='Rajesh Kumar'),
        Issue(id='ISS-3102', title='Leaking Pipe', description='Water leak in the main cafeteria', category='Plumbing', location='Cafeteria', priority='High', status='Reported', reported_by='student@campus.edu'),
        Issue(id='ISS-1122', title='Slow WiFi', description='WiFi signal is very weak in Library', category='Network', location='Library', priority='Medium', status='In Progress', reported_by='student@campus.edu', assigned_to='Priya Sharma'),
    ]
    
    for u in users: db.session.add(u)
    for i in issues: db.session.add(i)
    db.session.commit()

# ─── NAVIGATION ───
@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/admin')
def admin_page():
    return app.send_static_file('admin.html')

@app.route('/staff')
def staff_page():
    return app.send_static_file('staff.html')

@app.route('/user')
def user_page():
    return app.send_static_file('user.html')

@app.route('/<path:path>')
def serve_static(path):
    return app.send_static_file(path)

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        seed_db()
    app.run(debug=True, port=8000)
