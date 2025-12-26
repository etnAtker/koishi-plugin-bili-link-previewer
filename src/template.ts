export const cardTemplate = String.raw`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bilibili Card Vertical</title>
  <style>
    @import url('https://fonts.font.im/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap');

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      margin: 0;
      padding: 0;
      /* Background for body to avoid white edges if screenshot is slightly off, though we target #card */
      background: transparent; 
    }

    #card {
      position: relative;
      width: 600px;
      /* min-height removed as requested */
      height: fit-content; /* Allow growth */
      background: #121212;
      color: #fff;
      overflow: hidden; /* Clip the absolute background */
      font-family: 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
      /* No borderRadius if we want a clean rectangular export, or add if desired. Usually rectangular for social sharing is safe */
    }

    /* Inner padding container */
    .content-padding {
      position: relative;
      width: 100%;
      height: 100%;
      padding: 40px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      z-index: 1;
    }

    /* Dynamic Background */
    .bg-blur {
      position: absolute;
      top: -10%;
      left: -10%;
      width: 120%;
      height: 120%;
      background-image: url('<%= it.coverUrl %>');
      background-size: cover;
      background-position: center;
      filter: blur(50px) brightness(0.3);
      z-index: 0;
    }

    /* 1. Title */
    .title {
      font-size: 32px;
      font-weight: 700;
      line-height: 1.4;
      color: #ffffff;
      text-shadow: 0 2px 4px rgba(0,0,0,0.5);
    }

    /* 2. Meta: Author + Date */
    .meta-row {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 18px;
      color: rgba(255, 255, 255, 0.9);
    }

    .author {
      font-weight: 500;
      color: #fb7299;
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.1);
      padding: 6px 12px;
      border-radius: 6px;
      backdrop-filter: blur(4px);
    }

    .pubdate {
      color: rgba(255, 255, 255, 0.6);
    }

    /* 3. Cover Image */
    .cover-wrapper {
      width: 100%;
      aspect-ratio: 16/10;
      position: relative;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      background: #333;
    }

    .cover-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .duration-badge {
      position: absolute;
      bottom: 12px;
      right: 12px;
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      font-size: 16px;
      font-weight: 500;
      padding: 4px 8px;
      border-radius: 4px;
      backdrop-filter: blur(2px);
    }

    /* 4. Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      background: rgba(0, 0, 0, 0.2);
      padding: 16px;
      border-radius: 12px;
      backdrop-filter: blur(8px);
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .stat-icon {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 50%;
      padding: 4px;
    }

    .icon {
      width: 100%;
      height: 100%;
      fill: #fb7299;
    }

    .stat-value {
      font-size: 20px;
      font-weight: 600;
      color: #eee;
    }

    /* 5. Description */
    .description {
      font-size: 20px;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.8);
      padding: 16px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      /* Remove truncation for adaptive height */
      white-space: pre-wrap; /* Preserve formatting but wrap */
      overflow-wrap: break-word;
    }

  </style>
</head>
<body>

  <div id="card">
    <!-- Blurred Background -->
    <div class="bg-blur"></div>

    <!-- Main Content -->
    <div class="content-padding">
      
      <!-- 1. Title -->
      <div class="title"><%= it.title %></div>

      <!-- 2. Meta -->
      <div class="meta-row">
        <div class="author">
        <svg class="icon" viewBox="0 0 24 24" style="width: 17px; height: 17px; fill: currentColor;">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
          <span><%= it.author %></span>
        </div>
        <div class="pubdate"><%= it.pubDate %></div>
      </div>

      <!-- 3. Cover -->
      <div class="cover-wrapper">
        <img src="<%= it.coverUrl %>" class="cover-image" alt="Cover">
        <div class="duration-badge"><%= it.duration %></div>
      </div>

      <!-- 4. Stats -->
      <div class="stats-grid">
        <!-- Views -->
        <div class="stat-item">
          <div class="stat-icon">
            <svg class="icon" viewBox="0 0 24 24">
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
            </svg>
          </div>
          <div class="stat-value"><%= it.views %></div>
        </div>
        
        <!-- Danmaku -->
        <div class="stat-item">
          <div class="stat-icon">
            <svg class="icon" viewBox="0 0 24 24">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-3 9h-2v2h2v-2zm4-4H3V5h18v2z"/>
            </svg>
          </div>
          <div class="stat-value"><%= it.danmaku %></div>
        </div>

        <!-- Likes -->
        <div class="stat-item">
          <div class="stat-icon">
            <svg class="icon" viewBox="0 0 24 24">
              <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1.91l-.01-.01L23 10z"/>
            </svg>
          </div>
          <div class="stat-value"><%= it.likes %></div>
        </div>

        <!-- Favorites -->
        <div class="stat-item">
          <div class="stat-icon">
            <svg class="icon" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </div>
          <div class="stat-value"><%= it.favorites %></div>
        </div>
      </div>

      <!-- 5. Description -->
      <% if (it.desc) { %>
      <div class="description"><%= it.desc %></div>
      <% } %>
    </div>
  </div>

</body>
</html>
`;
