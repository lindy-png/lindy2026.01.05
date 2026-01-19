// Smooth scroll animations with Intersection Observer
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe all sections for fade-in animation
document.addEventListener('DOMContentLoaded', () => {
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(30px)';
        section.style.transition = 'opacity 0.8s ease-out, transform 0.8s ease-out';
        observer.observe(section);
    });

    // Animated counter for stats
    const animateCounter = (element, target, prefix = '', suffix = '') => {
        const duration = 2000;
        const fps = 60;
        const frames = duration / (1000 / fps);
        const increment = target / frames;
        let current = 0;
        let frame = 0;
        
        const updateCounter = () => {
            current = Math.min(current + increment, target);
            frame++;
            
            if (prefix === '$' && suffix === 'M') {
                element.textContent = prefix + current.toFixed(1) + suffix;
            } else {
                element.textContent = prefix + Math.floor(current) + suffix;
            }
            
            if (current < target) {
                requestAnimationFrame(updateCounter);
            } else {
                // Final value
                if (prefix === '$' && suffix === 'M') {
                    element.textContent = prefix + target.toFixed(1) + suffix;
                } else {
                    element.textContent = prefix + target + suffix;
                }
            }
        };
        
        updateCounter();
    };

    // Counter for hero stats
    const statObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const statValue = entry.target.querySelector('.stat-value');
                if (statValue && !statValue.dataset.animated) {
                    statValue.dataset.animated = 'true';
                    const prefix = statValue.dataset.prefix || '';
                    const suffix = statValue.dataset.suffix || '';
                    const target = parseFloat(statValue.dataset.target);
                    animateCounter(statValue, target, prefix, suffix);
                }
            }
        });
    }, { threshold: 0.5 });

    const heroStats = document.querySelectorAll('.hero-stat');
    heroStats.forEach(stat => statObserver.observe(stat));

    // Smooth scroll for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Navbar background on scroll
    let lastScroll = 0;
    const nav = document.querySelector('.nav');
    
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 100) {
            nav.style.backgroundColor = 'rgba(250, 248, 245, 0.98)';
            nav.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.05)';
        } else {
            nav.style.backgroundColor = 'rgba(250, 248, 245, 0.95)';
            nav.style.boxShadow = 'none';
        }
        
        lastScroll = currentScroll;
    });

    // Parallax effect for hero section
    const hero = document.querySelector('.hero');
    const heroContent = document.querySelector('.hero-content');
    
    if (hero && heroContent) {
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            const parallaxSpeed = 0.5;
            
            if (scrolled < window.innerHeight) {
                heroContent.style.transform = `translateY(${scrolled * parallaxSpeed}px)`;
                heroContent.style.opacity = 1 - (scrolled / window.innerHeight) * 0.3;
            }
        });
    }

    // Add stagger animation to skills list
    const skillLists = document.querySelectorAll('.skill-list li');
    const skillObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateX(0)';
                }, index * 50);
            }
        });
    }, { threshold: 0.1 });

    skillLists.forEach((item, index) => {
        item.style.opacity = '0';
        item.style.transform = 'translateX(-20px)';
        item.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
        skillObserver.observe(item);
    });
});
