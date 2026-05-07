// ── CMS EDIT SHORTCUT (production-safe delegated handler) ──
(() => {
    const DEBUG =
        new URLSearchParams(window.location.search).get('cms_debug') === 'true' ||
        localStorage.getItem('cms_debug') === 'true';

    const log = (...args) => {
        if (!DEBUG) return;
        try { console.log('[CMS]', ...args); } catch (_) {}
    };

    const isMacLike = () => /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');

    const hasToggleModifier = (e) => {
        // Requirement: ctrlKey for Win/Linux, metaKey for Mac.
        // Note: ctrl+click on macOS often maps to right-click, so metaKey is the reliable shortcut there.
        return isMacLike() ? !!e.metaKey : !!e.ctrlKey;
    };

    const attemptToggle = (remaining = 10) => {
        if (typeof window.CMS_TOGGLE === 'function') {
            log('Toggling edit mode');
            window.CMS_TOGGLE();
            return;
        }
        if (remaining <= 0) {
            log('CMS_TOGGLE not ready; giving up');
            return;
        }
        log('CMS_TOGGLE not ready; retrying...', remaining);
        setTimeout(() => attemptToggle(remaining - 1), 100);
    };

    document.addEventListener(
        'click',
        (e) => {
            const toggleEl = e.target && e.target.closest ? e.target.closest('[data-cms-toggle="true"]') : null;
            if (!toggleEl) return;

            // Activate ONLY on explicit shortcut (prevents accidental mobile taps).
            if (!hasToggleModifier(e)) {
                log('Toggle element clicked without modifier; ignored');
                return;
            }

            // Safety: ignore if event is synthetic/blocked; still allow if undefined (older Safari).
            if (typeof e.isTrusted === 'boolean' && e.isTrusted === false) {
                log('Untrusted click; ignored');
                return;
            }

            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

            log('Shortcut detected', {ctrlKey: !!e.ctrlKey, metaKey: !!e.metaKey});
            attemptToggle();
        },
        true // capture to survive other handlers
    );

    log('Delegated shortcut listener attached');
})();

document.addEventListener('DOMContentLoaded', () => {
    // ── INLINE CMS ARCHITECTURE ──
    const CMS = {
        EDIT_PARAM: 'edit',
        STORAGE_KEY: 'stormcloud_cms_persisted_data',
        isEditMode: false,
        observer: null,

        init() {
            this.detectEditMode();
            this.loadContent();
            this.fixNavLinks();
            
            // Re-bind UI if content is added dynamically
            this.setupMutationObserver();

            if (this.isEditMode) {
                this.enableEditing();
                this.injectToolbar();
                this.setupGlobalListeners();
            }
        },

        fixNavLinks() {
            // Smart auto-linker for navigation items
            const navLinks = document.querySelectorAll('.nav-links a');
            navLinks.forEach(a => {
                const text = a.innerText.trim().toLowerCase();
                if (text.includes('contact')) a.setAttribute('href', '#contact');
                else if (text.includes('partner')) a.setAttribute('href', '#partners');
                else if (text.includes('about')) a.setAttribute('href', '#about');
                else if (text.includes('cmmc')) a.setAttribute('href', '#cmmc');
                else if (text.includes('service')) a.setAttribute('href', '#services');
                else if (text.includes('industries')) a.setAttribute('href', '#industries');
            });
            
            // Fix footer links as well
            const footerLinks = document.querySelectorAll('.footer-col-sc a');
            footerLinks.forEach(a => {
                const text = a.innerText.trim().toLowerCase();
                if (text.includes('contact')) a.setAttribute('href', '#contact');
                else if (text.includes('partner')) a.setAttribute('href', '#partners');
                else if (text.includes('about')) a.setAttribute('href', '#about');
            });
        },

        setupGlobalListeners() {
            // Global Delete Delegation - Use window and capture phase to ensure we intercept
            const handleDelete = (e) => {
                const delBtn = e.target.closest('.cms-delete-btn');
                if (delBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    if (e.type === 'click') {
                        const el = delBtn.parentElement;
                        if (!el) return;

                        // Find the logical block to delete
                        const target = el.closest('li, .partner-box, .service-card, .expert-card, .stat-card, .sc-feature, .why-point, .nav-links > li, .ind-panel, .step-item') || el;
                        
                        target.remove();
                        this.showNotification('Element deleted');
                    }
                    return false;
                }
            };

            window.addEventListener('mousedown', handleDelete, true);
            window.addEventListener('click', handleDelete, true);
        },

        detectEditMode() {
            const params = new URLSearchParams(window.location.search);
            this.isEditMode = params.get(this.EDIT_PARAM) === 'true' || localStorage.getItem('cms_editing_active') === 'true';
            
            if (this.isEditMode) {
                document.body.classList.add('is-editing');
                localStorage.setItem('cms_editing_active', 'true');
                
                // Adjust nav top if it exists
                const nav = document.querySelector('nav');
                if (nav) nav.style.top = '60px';
            }
        },

        // Toggle edit mode manual
        toggleEditMode() {
            if (!this.isEditMode) {
                localStorage.setItem('cms_editing_active', 'true');
                const url = new URL(window.location);
                url.searchParams.set(this.EDIT_PARAM, 'true');
                window.location.href = url.href;
            } else {
                localStorage.removeItem('cms_editing_active');
                // Ensure everything is clean
                this.disableEditing();
                const url = new URL(window.location);
                url.searchParams.delete(this.EDIT_PARAM);
                window.location.href = url.origin + url.pathname;
            }
        },

        enableEditing() {
            if (!this.isEditMode) return;
            
            // All elements marked as editable
            const editables = document.querySelectorAll('[data-editable]');
            editables.forEach(el => {
                if (el.tagName !== 'IMG') {
                    el.setAttribute('contenteditable', 'true');
                    el.setAttribute('spellcheck', 'false');
                }
                
                // Add Delete Button if it doesn't exist and we are in edit mode
                if (this.isEditMode && !el.querySelector(':scope > .cms-delete-btn')) {
                    const delBtn = document.createElement('span');
                    delBtn.className = 'cms-delete-btn';
                    delBtn.setAttribute('contenteditable', 'false');
                    delBtn.textContent = '×';
                    delBtn.title = 'Delete element';
                    // Ensure the button itself is not editable and doesn't allow cursor inside
                    delBtn.style.userSelect = 'none';
                    el.appendChild(delBtn);
                }

                // Double click to edit SVG code if it's an icon container
                if (el.querySelector('svg') || el.hasAttribute('data-key') && el.getAttribute('data-key').includes('icon')) {
                    el.title = 'Double-click to edit SVG code';
                    el.addEventListener('dblclick', (e) => {
                        if (!this.isEditMode) return;
                        e.stopPropagation();
                        const currentSvg = el.querySelector('svg') ? el.querySelector('svg').outerHTML : '';
                        const newSvg = window.prompt('Paste new SVG code here:', currentSvg);
                        if (newSvg !== null) {
                            // Find where the SVG was or just replace content
                            if (el.querySelector('svg')) {
                                el.querySelector('svg').outerHTML = newSvg;
                            } else {
                                el.innerHTML = newSvg;
                                // Re-inject delete button if it was wiped
                                this.enableEditing();
                            }
                        }
                    });
                }

                // Prevent editing of the delete button itself if it got focus
                el.addEventListener('keydown', (e) => {
                    if (e.target.classList.contains('cms-delete-btn')) {
                        e.preventDefault();
                    }
                    // Handle list item addition with Enter if it's a list container? No, we have add buttons.
                });

                // Prevent editing of icons via traditional typing if it's purely an icon
                if (el.children.length > 0 && el.querySelector('svg') && el.innerText.trim() === '×') {
                    // It's just an icon + delete button
                    el.setAttribute('contenteditable', 'false');
                }

                // Prevent navigation on editable links
                if (el.tagName === 'A') {
                    const preventNav = (e) => { if (this.isEditMode) e.preventDefault(); };
                    el.removeEventListener('click', preventNav);
                    el.addEventListener('click', preventNav);
                }
            });

            // Image Elements specific handling
            const images = document.querySelectorAll('img[data-editable]');
            images.forEach(img => {
                img.style.cursor = 'pointer';
                img.title = 'Click to change image';
                const triggerUpload = () => { if (this.isEditMode) this.triggerImageUpload(img); };
                img.removeEventListener('click', triggerUpload);
                img.addEventListener('click', triggerUpload);
            });

            // List Elements (Addition)
            const lists = document.querySelectorAll('[data-list]');
            lists.forEach(list => {
                if (!list.querySelector(':scope > .cms-add-btn')) {
                    const addBtn = document.createElement('div');
                    addBtn.className = 'cms-add-btn';
                    addBtn.setAttribute('contenteditable', 'false');
                    addBtn.innerHTML = '+ Add Item';
                    addBtn.onclick = (e) => {
                        e.stopPropagation();
                        this.addItemToList(list);
                    };
                    list.appendChild(addBtn);
                }
            });
        },

        addItemToList(listElement) {
            const children = Array.from(listElement.children).filter(c => !c.classList.contains('cms-add-btn'));
            if (children.length === 0) return;
            
            const lastItem = children[children.length - 1];
            const newItem = lastItem.cloneNode(true);
            
            // Deep clean the clone
            const cleanNode = (node) => {
                if (node.nodeType !== 1) return;
                
                // Unlink from global keys to allow unique content, but keep data-editable
                node.removeAttribute('data-key');
                
                // Remove CMS-specific UI that was cloned
                const cmsUi = node.querySelectorAll('.cms-delete-btn, .cms-add-btn');
                cmsUi.forEach(btn => btn.remove());
                
                // Reset text if it's a leaf node that is supposed to be editable
                if (node.hasAttribute('data-editable') && node.tagName !== 'IMG' && node.children.length === 0) {
                    node.innerHTML = 'New Item';
                }
                
                Array.from(node.children).forEach(cleanNode);
            };

            cleanNode(newItem);
            
            // Insert before the add button
            const addBtn = listElement.querySelector('.cms-add-btn');
            listElement.insertBefore(newItem, addBtn);
            
            // Re-apply listeners
            this.enableEditing();
            this.showNotification('Item added');
        },

        disableEditing() {
            const editables = document.querySelectorAll('[data-editable], [contenteditable]');
            editables.forEach(el => {
                el.removeAttribute('contenteditable');
                el.removeAttribute('spellcheck');
                if (el.tagName === 'IMG') {
                    el.style.cursor = 'default';
                }
                const btns = el.querySelectorAll('.cms-delete-btn, .cms-add-btn');
                btns.forEach(b => b.remove());
            });
            document.querySelectorAll('.cms-add-btn, .cms-delete-btn').forEach(b => b.remove());
            document.body.classList.remove('is-editing');
        },

        setupMutationObserver() {
            this.observer = new MutationObserver((mutations) => {
                if (!this.isEditMode) return;
                
                let shouldRebind = false;
                mutations.forEach(mutation => {
                    if (mutation.addedNodes.length) {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1 && (node.hasAttribute('data-editable') || node.querySelector('[data-editable]'))) {
                                shouldRebind = true;
                            }
                        });
                    }
                });

                if (shouldRebind) this.enableEditing();
            });

            this.observer.observe(document.body, { childList: true, subtree: true });
        },

        async triggerImageUpload(imgElement) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    const base64 = await this.processImage(file);
                    imgElement.src = base64;
                    this.showNotification('Image updated (unsaved)');
                } catch (err) {
                    this.showNotification('Error processing image', 'error');
                }
            };
            input.click();
        },

        processImage(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = (event) => {
                    const img = new Image();
                    img.src = event.target.result;
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let width = img.width;
                        let height = img.height;

                        // Downscale if too large
                        const MAX_WIDTH = 1200;
                        if (width > MAX_WIDTH) {
                            height = (MAX_WIDTH / width) * height;
                            width = MAX_WIDTH;
                        }

                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        
                        // Compress (Use PNG to preserve transparency)
                        resolve(canvas.toDataURL('image/png'));
                    };
                };
                reader.onerror = reject;
            });
        },

        injectToolbar() {
            const toolbar = document.createElement('div');
            toolbar.className = 'cms-toolbar';
            toolbar.innerHTML = `
                <div class="cms-toolbar-content">
                    <div class="cms-brand">CMS EDITOR v1.0</div>
                    <div class="cms-actions">
                        <button class="cms-btn cms-btn-exit" id="cms-exit">EXIT MODE</button>
                        <button class="cms-btn cms-btn-save" id="cms-save">
                            <span class="btn-text">SAVE CHANGES</span>
                            <span class="loading-spinner"></span>
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(toolbar);

            this.makeDraggable(toolbar);

            // Floating Indicator
            const indicator = document.createElement('div');
            indicator.className = 'cms-status-indicator';
            indicator.innerHTML = '<span class="pulse-dot"></span> EDIT MODE ACTIVE';
            document.body.appendChild(indicator);
            this.makeDraggable(indicator);

            // Bind Events
            document.getElementById('cms-save').addEventListener('click', () => this.saveContent());
            document.getElementById('cms-exit').addEventListener('click', () => this.toggleEditMode());
        },

        saveContent() {
            this.fixNavLinks();
            
            const saveBtn = document.getElementById('cms-save');
            saveBtn.classList.add('is-saving');
            
            const data = {
                keys: {},
                lists: {}
            };

            // Save standard keyed elements
            const elements = document.querySelectorAll('[data-key]');
            elements.forEach(el => {
                const key = el.getAttribute('data-key');
                if (el.tagName === 'IMG') {
                    data.keys[key] = { type: 'image', value: el.src };
                } else {
                    // Filter out CMS buttons before saving
                    const clone = el.cloneNode(true);
                    const btns = clone.querySelectorAll('.cms-delete-btn, .cms-add-btn');
                    btns.forEach(b => b.remove());
                    data.keys[key] = { type: 'text', value: clone.innerHTML };
                }
            });

            // Save list structures
            const lists = document.querySelectorAll('[data-list]');
            lists.forEach(list => {
                const listKey = list.getAttribute('data-list');
                const clone = list.cloneNode(true);
                // Remove CMS buttons
                const btns = clone.querySelectorAll('.cms-delete-btn, .cms-add-btn');
                btns.forEach(b => b.remove());
                data.lists[listKey] = clone.innerHTML;
            });

            try {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
                setTimeout(() => {
                    saveBtn.classList.remove('is-saving');
                    this.showNotification('Website content saved successfully!');
                }, 1000);
            } catch (e) {
                saveBtn.classList.remove('is-saving');
                this.showNotification('Storage full! Try removing large images.', 'error');
            }
        },

        loadContent() {
            const rawData = localStorage.getItem(this.STORAGE_KEY);
            if (!rawData) return;
            
            const sanitize = (html) => {
                const div = document.createElement('div');
                div.innerHTML = html;
                div.querySelectorAll('.cms-delete-btn, .cms-add-btn').forEach(el => el.remove());
                return div.innerHTML;
            };

            try {
                const data = JSON.parse(rawData);
                
                // Hydrate lists first (structural)
                if (data.lists) {
                    Object.keys(data.lists).forEach(listKey => {
                        const lists = document.querySelectorAll(`[data-list="${listKey}"]`);
                        lists.forEach(list => {
                            list.innerHTML = sanitize(data.lists[listKey]);
                        });
                    });
                }

                // Hydrate keys (content)
                if (data.keys) {
                    Object.keys(data.keys).forEach(key => {
                        const entry = data.keys[key];
                        const elements = document.querySelectorAll(`[data-key="${key}"]`);
                        elements.forEach(el => {
                            if (entry.type === 'image' && el.tagName === 'IMG') {
                                el.src = entry.value;
                            } else if (entry.type === 'text') {
                                el.innerHTML = sanitize(entry.value);
                            }
                        });
                    });
                }

                // If not in edit mode, ensure total cleanup of any residual edit attributes
                if (!this.isEditMode) {
                    setTimeout(() => this.disableEditing(), 10);
                }
                
                console.log('CMS: Content Loaded');
            } catch (err) {
                console.error('CMS: Hydration error', err);
            }
        },

        showNotification(msg, type = 'success') {
            const toast = document.createElement('div');
            toast.className = `cms-notification ${type}`;
            toast.innerText = msg;
            document.body.appendChild(toast);

            setTimeout(() => {
                toast.classList.add('visible');
                setTimeout(() => {
                    toast.classList.remove('visible');
                    setTimeout(() => toast.remove(), 400);
                }, 3000);
            }, 100);
        }
    };

    window.CMS_TOGGLE = () => CMS.toggleEditMode();
    
    // ── RISING DATA BUBBLES ──
    const initParticles = () => {
        const containers = document.querySelectorAll('.particle-container');
        containers.forEach(container => {
            const particleCount = parseInt(container.getAttribute('data-count')) || 30;
            for (let i = 0; i < particleCount; i++) {
                spawnParticle(container);
            }
        });
    };

    const spawnParticle = (container) => {
        const particle = document.createElement('div');
        particle.className = 'data-particle';
        
        const size = Math.random() * 15 + 5; // Larger for bubbles
        const left = Math.random() * 100;
        const duration = Math.random() * 10 + 10;
        const delay = Math.random() * 20;
        
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.left = `${left}%`;
        particle.style.animation = `riseParticle ${duration}s linear ${delay}s infinite`;
        
        container.appendChild(particle);
    };

    initParticles();

    // ── DRAGGABLE CMS TOOLBAR ──
    CMS.makeDraggable = (el) => {
        let isDragging = false;
        let startX, startY;
        let startLeft, startTop;

        el.style.cursor = 'grab';

        el.addEventListener('mousedown', (e) => {
            // Only drag if clicking the toolbar background or brand, not buttons
            if (e.target.closest('button')) return;
            
            isDragging = true;
            el.style.cursor = 'grabbing';
            startX = e.clientX;
            startY = e.clientY;
            
            const style = window.getComputedStyle(el);
            startLeft = parseInt(style.left) || (window.innerWidth - parseInt(style.right) - el.offsetWidth);
            startTop = parseInt(style.top);
            
            // Switch from right/bottom positioning to top/left for easier math during drag
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            el.style.left = `${startLeft}px`;
            el.style.top = `${startTop}px`;
            
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            const newLeft = startLeft + deltaX;
            const newTop = startTop + deltaY;
            
            // Constrain to viewport
            const maxLeft = window.innerWidth - el.offsetWidth;
            const maxTop = window.innerHeight - el.offsetHeight;
            
            const clampedLeft = Math.max(0, Math.min(newLeft, maxLeft));
            const clampedTop = Math.max(0, Math.min(newTop, maxTop));
            
            el.style.left = `${clampedLeft}px`;
            el.style.top = `${clampedTop}px`;
            
            // Special sync for toolbar to push nav down if it's the toolbar
            if (el.classList.contains('cms-toolbar')) {
                const nav = document.querySelector('nav');
                if (nav) {
                    nav.style.top = `${clampedTop + el.offsetHeight}px`;
                }
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            el.style.cursor = 'grab';
        });
    };

    CMS.init();

    // ── RESET SCROLL ON RELOAD ──
    if (window.history.scrollRestoration) {
        window.history.scrollRestoration = 'manual';
    }
    
    // Force scroll to top immediately and after a short delay to override browser behavior
    window.scrollTo(0, 0);
    setTimeout(() => {
        window.scrollTo({
            top: 0,
            left: 0,
            behavior: 'instant'
        });
    }, 50);

    // If there's a hash in the URL, remove it to prevent jumping
    if (window.location.hash) {
        history.replaceState(null, null, window.location.pathname + window.location.search);
    }

    // ── REVEAL ANIMATIONS ON SCROLL ──
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const revealElements = document.querySelectorAll('.stat-card, .expert-card, .service-card, .gcc-row, .why-point, .step-item, .controls-card, .savings-card, .step-card-alt, .sc-feature, .wwd-card, .partner-box');
    revealElements.forEach(el => {
        el.classList.add('reveal', 'pre-reveal');
        observer.observe(el);
    });

    // ── NAVBAR SCROLL EFFECT ──
    const nav = document.querySelector('nav');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            nav.style.background = 'rgba(255,255,255,0.98)';
            nav.style.padding = window.innerWidth <= 968 ? '0 24px' : '0 32px';
            nav.style.height = '64px';
        } else {
            nav.style.background = 'rgba(255,255,255,0.92)';
            nav.style.padding = window.innerWidth <= 968 ? '0 24px' : '0 48px';
            nav.style.height = '72px';
        }
    });

    // ── MOBILE MENU LOGIC ──
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    
    if (mobileBtn && navLinks) {
        mobileBtn.addEventListener('click', () => {
            mobileBtn.classList.toggle('active');
            navLinks.classList.toggle('active');
        });
        
        // Hide menu when clicking a link
        const links = navLinks.querySelectorAll('a');
        links.forEach(link => {
            link.addEventListener('click', () => {
                mobileBtn.classList.remove('active');
                navLinks.classList.remove('active');
            });
        });
    }

    // ── TAB SWITCHING LOGIC ──
    window.switchTab = function(event, tabId) {
        const tabs = document.querySelectorAll('.ind-tab');
        tabs.forEach(tab => tab.classList.remove('active'));
        event.currentTarget.classList.add('active');
        
        const panels = document.querySelectorAll('.ind-panel');
        panels.forEach(panel => {
            panel.classList.remove('active');
            if (panel.id === tabId) {
                panel.classList.add('active');
            }
        });
    };
});
