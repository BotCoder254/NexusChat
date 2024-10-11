const socket = io();
let currentRoom = null;
let currentGroupId = null;

function joinGroup(groupId) {
    if (currentRoom) {
        socket.emit('leave', {room: currentRoom});
    }
    currentRoom = groupId;
    currentGroupId = groupId;
    socket.emit('join', {room: groupId});
    document.getElementById('current-group-name').textContent = `Group: ${groupId}`;
    document.getElementById('show-members-btn').classList.remove('hidden');
    loadGroupMessages(groupId);
}

function loadGroupMessages(groupId) {
    fetch(`/get_messages/${groupId}`)
        .then(response => response.json())
        .then(messages => {
            const messagesContainer = document.getElementById('chat-messages');
            messagesContainer.innerHTML = '';
            messages.forEach(message => {
                appendMessage(message);
            });
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        });
}

document.getElementById('message-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const messageInput = document.getElementById('message-input');
    const fileInput = document.getElementById('file-input');
    const message = messageInput.value.trim();
    
    if (message || fileInput.files.length > 0) {
        const data = {
            room: currentRoom,
            msg: message,
            timestamp: new Date().toISOString()
        };

        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const reader = new FileReader();
            reader.onload = function(e) {
                data.file = {
                    name: file.name,
                    type: file.type,
                    data: e.target.result
                };
                socket.emit('message', data);
            };
            reader.readAsDataURL(file);
        } else {
            socket.emit('message', data);
        }

        messageInput.value = '';
        fileInput.value = '';
    }
});

socket.on('message', function(data) {
    appendMessage(data);
});

function appendMessage(data) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message', data.username === '{{ session.username }}' ? 'sent' : 'received');
    
    let messageContent = `
        <div class="flex items-start">
            <img src="/static/uploads/profile_pics/${data.username}.png" alt="${data.username}" class="w-8 h-8 rounded-full mr-2">
            <div>
                <div class="username">${data.username}</div>
                <div class="message-content">${data.msg}</div>
    `;
    
    if (data.file) {
        if (data.file.type.startsWith('image/')) {
            messageContent += `<img src="/static/uploads/media/${data.file.name}" alt="Uploaded Image" class="file-preview">`;
        } else if (data.file.type.startsWith('video/')) {
            messageContent += `<video src="/static/uploads/media/${data.file.name}" controls class="file-preview"></video>`;
        } else if (data.file.type.startsWith('audio/')) {
            messageContent += `<audio src="/static/uploads/media/${data.file.name}" controls></audio>`;
        }
    }
    
    messageContent += `
                <div class="timestamp">${new Date(data.timestamp).toLocaleString()}</div>
            </div>
        </div>
    `;
    messageElement.innerHTML = messageContent;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showCreateGroupModal() {
    document.getElementById('create-group-modal').classList.remove('hidden');
}

function hideCreateGroupModal() {
    document.getElementById('create-group-modal').classList.add('hidden');
}

document.getElementById('create-group-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const groupName = document.getElementById('group-name').value;
    const isPrivate = document.getElementById('is-private').checked;
    
    fetch('/create_group', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `group_name=${encodeURIComponent(groupName)}&is_private=${isPrivate}`
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const groupList = document.getElementById('group-list');
            const newGroupItem = document.createElement('li');
            newGroupItem.classList.add('p-4', 'hover:bg-gray-50', 'cursor-pointer');
            newGroupItem.onclick = () => joinGroup(data.group_id);
            newGroupItem.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="font-medium">${groupName}</span>
                    <span class="text-sm text-gray-500">1 member</span>
                </div>
                ${isPrivate ? `
                <span class="text-xs text-blue-500 cursor-pointer mt-1" data-tooltip="Click to copy invite link" onclick="copyInviteLink('${data.invite_link}')">
                    <i class="fas fa-link"></i> Invite Link
                </span>
                ` : ''}
            `;
            groupList.appendChild(newGroupItem);
            hideCreateGroupModal();
        } else {
            alert('Failed to create group: ' + data.message);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred while creating the group');
    });
});

function showProfileModal() {
    document.getElementById('profile-modal').classList.remove('hidden');
}

function hideProfileModal() {
    document.getElementById('profile-modal').classList.add('hidden');
}

document.getElementById('profile-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const formData = new FormData(this);
    
    fetch('/update_profile', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Profile updated successfully');
            hideProfileModal();
            // Update the profile image in the sidebar
            const profileImage = document.querySelector('.flex-shrink-0 img');
            profileImage.src = URL.createObjectURL(formData.get('profile_image'));
        } else {
            alert('Failed to update profile');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred while updating the profile');
    });
});

// Preview profile image before upload
document.getElementById('profile-image-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('profile-image-preview').src = e.target.result;
        }
        reader.readAsDataURL(file);
    }
});

function showJoinPrivateGroupModal() {
    document.getElementById('join-private-group-modal').classList.remove('hidden');
}

function hideJoinPrivateGroupModal() {
    document.getElementById('join-private-group-modal').classList.add('hidden');
}

document.getElementById('join-private-group-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const inviteLink = document.getElementById('invite-link-input').value;
    
    fetch(`/join_private_group/${inviteLink}`)
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Joined private group successfully');
            location.reload(); // Refresh the page to show the new group
        } else {
            alert('Failed to join private group: ' + data.message);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred while joining the private group');
    });
});

function copyInviteLink(inviteLink) {
    navigator.clipboard.writeText(inviteLink).then(() => {
        alert('Invite link copied to clipboard!');
    }, (err) => {
        console.error('Could not copy text: ', err);
    });
}

function showGroupMembers() {
    fetch(`/get_group_members/${currentGroupId}`)
    .then(response => response.json())
    .then(members => {
        const membersList = document.getElementById('group-members-list');
        membersList.innerHTML = '';
        members.forEach(member => {
            const memberItem = document.createElement('li');
            memberItem.classList.add('flex', 'items-center', 'p-2');
            memberItem.innerHTML = `
                <img src="/static/uploads/profile_pics/${member.username}.png" alt="${member.username}" class="w-8 h-8 rounded-full mr-2">
                <span>${member.username}</span>
            `;
            membersList.appendChild(memberItem);
        });
        document.getElementById('group-members-modal').classList.remove('hidden');
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred while fetching group members');
    });
}

function hideGroupMembersModal() {
    document.getElementById('group-members-modal').classList.add('hidden');
}

// Initialize tooltips for group invite links
function initTooltips() {
    const tooltips = document.querySelectorAll('[data-tooltip]');
    tooltips.forEach(tooltip => {
        tooltip.addEventListener('mouseover', showTooltip);
        tooltip.addEventListener('mouseout', hideTooltip);
    });
}

function showTooltip(e) {
    const tooltipText = e.target.getAttribute('data-tooltip');
    const tooltip = document.createElement('div');
    tooltip.classList.add('absolute', 'bg-black', 'text-white', 'px-2', 'py-1', 'rounded', 'text-xs', 'mt-1');
    tooltip.textContent = tooltipText;
    document.body.appendChild(tooltip);
    
    const rect = e.target.getBoundingClientRect();
    tooltip.style.top = `${rect.bottom + 5}px`;
    tooltip.style.left = `${rect.left}px`;
}

function hideTooltip() {
    const tooltip = document.querySelector('.absolute');
    if (tooltip) {
        tooltip.remove();
    }
}

// Call initTooltips when the page loads
document.addEventListener('DOMContentLoaded', initTooltips);