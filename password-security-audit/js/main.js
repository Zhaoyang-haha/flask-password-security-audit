/* ============================================================
   Flask 密码安全审计报告 — JavaScript 交互脚本
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================================
  // 1. 导航栏滚动隐藏/显示
  // ==========================================================
  const navbar = document.querySelector('.navbar');
  let lastScrollY = 0;
  let scrollTimer = null;

  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    if (currentScrollY > lastScrollY && currentScrollY > 200) {
      navbar.classList.add('hidden');
    } else {
      navbar.classList.remove('hidden');
    }
    lastScrollY = currentScrollY;

    // 回到顶部按钮
    const backBtn = document.querySelector('.back-to-top');
    if (backBtn) {
      if (currentScrollY > 500) {
        backBtn.classList.add('visible');
      } else {
        backBtn.classList.remove('visible');
      }
    }
  }, { passive: true });

  // ==========================================================
  // 2. 移动端导航切换
  // ==========================================================
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (navToggle) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
  }

  // 点击导航链接后关闭菜单
  document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
    });
  });

  // ==========================================================
  // 3. 漏洞卡片展开/收起
  // ==========================================================
  document.querySelectorAll('.vuln-toggle').forEach(btn => {
    btn.addEventListener('click', function() {
      const card = this.closest('.vuln-card');
      const details = card.querySelector('.vuln-details');
      const isOpen = details.classList.contains('open');

      if (isOpen) {
        details.classList.remove('open');
        this.textContent = '查看详情 ▾';
      } else {
        details.classList.add('open');
        this.textContent = '收起详情 ▴';
      }
    });
  });

  // ==========================================================
  // 4. 代码复制按钮
  // ==========================================================
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const codeBlock = this.closest('.code-block');
      const code = codeBlock.querySelector('pre').textContent;

      navigator.clipboard.writeText(code).then(() => {
        const originalText = this.textContent;
        this.textContent = '已复制 ✓';
        this.style.borderColor = '#137333';
        this.style.color = '#137333';

        setTimeout(() => {
          this.textContent = originalText;
          this.style.borderColor = '';
          this.style.color = '';
        }, 2000);
      }).catch(() => {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);

        this.textContent = '已复制 ✓';
        setTimeout(() => {
          this.textContent = '复制代码';
        }, 2000);
      });
    });
  });

  // ==========================================================
  // 5. 生成浮动粒子（封面背景）
  // ==========================================================
  const particlesContainer = document.querySelector('.hero-particles');
  if (particlesContainer) {
    for (let i = 0; i < 30; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      const size = Math.random() * 4 + 2;
      particle.style.width = size + 'px';
      particle.style.height = size + 'px';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.top = Math.random() * 100 + '%';
      particle.style.animationDelay = Math.random() * 20 + 's';
      particle.style.animationDuration = (Math.random() * 15 + 15) + 's';
      particlesContainer.appendChild(particle);
    }
  }

  // ==========================================================
  // 6. 主动画：滚动渐入 (Intersection Observer)
  // ==========================================================
  const animateElements = document.querySelectorAll(
    '.vuln-card, .principle-list li, .stat-card, .fix-compare, .timeline'
  );

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    animateElements.forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(30px)';
      el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      observer.observe(el);
    });
  } else {
    // Fallback: make everything visible
    animateElements.forEach(el => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
  }

  // ==========================================================
  // 7. 平滑滚动到锚点 (polyfill for Safari)
  // ==========================================================
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        const offset = 70; // navbar height
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top: targetPosition, behavior: 'smooth' });
      }
    });
  });

  // ==========================================================
  // 8. 表头固定在表格滚动
  // ==========================================================
  // No additional logic needed; CSS handles overflow-x

  console.log('🔒 Flask Password Security Audit — 页面加载完成');
});
