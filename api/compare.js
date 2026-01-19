import { ApifyClient } from 'apify-client';
import Anthropic from '@anthropic-ai/sdk';

// Initialize Apify client
const client = new ApifyClient({
    token: process.env.APIFY_API_TOKEN
});

// Initialize Anthropic Claude
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// Lindy's profile data for comparison
const lindyProfile = {
    skills: [
        'AI agent architecture', 'Prompt engineering', 'Multi-agent workflows',
        'LLM evaluation and testing', 'Voice AI', 'API integrations',
        'Enterprise sales', 'MEDDICC', 'SANDLER', 'BANT', 'Challenger Sale',
        'Solution engineering', 'ICP development', 'Pricing and packaging',
        'Sales playbook creation', '0 to 1 vertical building'
    ],
    interests: ['Sauna', 'Hiking', 'Pilates', 'Running', 'Podcasts'],
    location: 'San Francisco',
    industry: 'AI/SaaS',
    companies: ['Lindy', 'Teamflow', 'Cintas']
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    try {
        let profileData;
        
        // Determine if LinkedIn or Twitter
        if (url.includes('linkedin.com')) {
            profileData = await scrapeLinkedIn(url);
        } else if (url.includes('twitter.com') || url.includes('x.com')) {
            profileData = await scrapeTwitter(url);
        } else {
            return res.status(400).json({ error: 'Please provide a LinkedIn or Twitter URL' });
        }
        
        // Compare profiles using LLM
        const comparison = await compareProfiles(profileData, lindyProfile);
        
        res.json({
            profileData: {
                name: profileData.name,
                headline: profileData.headline,
                location: profileData.location
            },
            ...comparison
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message || 'Failed to scrape profile' });
    }
}

async function scrapeLinkedIn(profileUrl) {
    try {
        // LinkedIn scraper actor from Apify store
        // Using actor ID format (hash) instead of username/actor-name
        const actorsToTry = [
            '2SyF0bVxmgGr8IVCZ', // Actor ID from Apify console
            'dev_fusion/Linkedin-Profile-Scraper',
            'dev_fusion/linkedin-profile-scraper'
        ];
        
        let lastError;
        for (const actorId of actorsToTry) {
            try {
                // Try different input formats for different actors
                let input;
                if (actorId === '2SyF0bVxmgGr8IVCZ') {
                    // Actor ID format - try common LinkedIn input formats
                    input = {
                        profileUrls: [profileUrl],
                        startUrls: [{ url: profileUrl }]
                    };
                } else if (actorId.includes('dev_fusion')) {
                    input = {
                        profileUrls: [profileUrl],
                        startUrls: [{ url: profileUrl }]
                    };
                } else {
                    input = {
                        profileUrls: [profileUrl]
                    };
                }
                
                const run = await client.actor(actorId).call(input);
                const { items } = await client.dataset(run.defaultDatasetId).listItems();
                
                if (items.length === 0) {
                    continue; // Try next actor
                }
                
                const profile = items[0];
                
                return {
                    name: profile.fullName || profile.name || (profile.firstName && profile.lastName ? profile.firstName + ' ' + profile.lastName : ''),
                    headline: profile.headline || profile.headlineText || '',
                    location: profile.location || profile.locationName || '',
                    skills: (profile.skills || []).map(s => s.name || s.title || s),
                    experiences: (profile.experiences || profile.positions || []).map(e => ({
                        company: e.companyName || e.company || '',
                        title: e.title || e.positionTitle || ''
                    })),
                    education: profile.education || [],
                    summary: profile.summary || profile.about || ''
                };
            } catch (error) {
                lastError = error;
                continue; // Try next actor
            }
        }
        
        // Provide helpful error message
        throw new Error(`LinkedIn scraping unavailable. Please find a LinkedIn scraper actor at https://apify.com/store?query=linkedin and update the actor ID in the code. Last error: ${lastError?.message || 'No actors found'}`);
    } catch (error) {
        throw new Error(`LinkedIn scraping failed: ${error.message}`);
    }
}

async function scrapeTwitter(profileUrl) {
    try {
        // Extract username from URL
        const username = profileUrl.match(/(?:twitter\.com\/|x\.com\/)([^\/\?]+)/)?.[1];
        
        if (!username) {
            throw new Error('Invalid Twitter URL');
        }
        
        // Use Apify Twitter Scraper
        const input = {
            startUrls: [{ url: `https://twitter.com/${username}` }],
            maxTweets: 50,
            addUserInfo: true
        };
        
        const run = await client.actor('apify/twitter-scraper').call(input);
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        
        if (items.length === 0) {
            throw new Error('Profile not found or could not be scraped');
        }
        
        const userInfo = items.find(item => item.type === 'User' || item.user);
        const tweets = items.filter(item => item.type === 'Tweet' || item.text);
        
        return {
            name: userInfo?.name || userInfo?.user?.name || username,
            headline: userInfo?.bio || userInfo?.description || '',
            location: userInfo?.location || '',
            tweets: tweets.map(t => t.text || t.fullText || '').join(' ')
        };
    } catch (error) {
        throw new Error(`Twitter scraping failed: ${error.message}`);
    }
}

async function compareProfiles(userProfile, lindyProfile) {
    try {
        // Format profiles for LLM
        const userProfileText = `
Name: ${userProfile.name || 'Unknown'}
Headline: ${userProfile.headline || ''}
Location: ${userProfile.location || ''}
Skills: ${(userProfile.skills || []).join(', ')}
Experience: ${(userProfile.experiences || []).map(e => `${e.title || ''} at ${e.company || ''}`).join('; ')}
Summary: ${userProfile.summary || userProfile.bio || ''}
`;

        const lindyProfileText = `
Name: Lindy Drope
Headline: Founding team at Lindy. Leading the sales org. Building the future of work with AI.
Location: San Francisco, CA
Skills: ${lindyProfile.skills.join(', ')}
Experience: Head of Sales at Lindy (2023-Present), Account Executive at Teamflow (2022-2023), Enterprise Account Executive at Cintas (2020-2022)
Interests: ${lindyProfile.interests.join(', ')}
Summary: Founding GTM hire at Lindy, an AI assistant platform. Acquired 500+ customers, built healthcare vertical from zero to $1M in revenue. Closed $4M+ in total revenue. Built and deployed 80+ AI agents.
`;

        const prompt = `You are analyzing two professional profiles to find meaningful connections and interesting differences. Be insightful, specific, and conversational.

User Profile:
${userProfileText}

Lindy's Profile:
${lindyProfileText}

Analyze these profiles and provide:
1. **Commonalities** - Specific, meaningful connections (skills, experiences, interests, industry, location, career paths, values, etc.). Be specific - don't just say "both in tech" if you can be more precise.
2. **Interesting Differences** - What makes each person unique or what could lead to interesting conversations.

Format your response as JSON:
{
  "commonalities": ["specific commonality 1", "specific commonality 2", ...],
  "differences": ["interesting difference 1", "interesting difference 2", ...]
}

Be thoughtful and find genuine connections, even subtle ones. If there are no obvious commonalities, think creatively about potential shared interests, complementary skills, or conversation starters.`;

        const message = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1000,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        // Parse LLM response
        const responseText = message.content[0].text;
        
        // Try to extract JSON from response
        let comparison;
        try {
            // Look for JSON in the response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                comparison = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in response');
            }
        } catch (parseError) {
            // Fallback: parse manually or use LLM's text
            console.error('Failed to parse LLM JSON:', parseError);
            // Extract commonalities and differences from text
            const commonalitiesMatch = responseText.match(/commonalities?[:\-]?\s*\[?([^\]]+)\]?/i);
            const differencesMatch = responseText.match(/differences?[:\-]?\s*\[?([^\]]+)\]?/i);
            
            comparison = {
                commonalities: commonalitiesMatch 
                    ? commonalitiesMatch[1].split(',').map(s => s.trim().replace(/["']/g, '')).filter(s => s)
                    : ['Analyzing profiles...'],
                differences: differencesMatch
                    ? differencesMatch[1].split(',').map(s => s.trim().replace(/["']/g, '')).filter(s => s)
                    : []
            };
        }

        return {
            commonalities: comparison.commonalities.length > 0 
                ? comparison.commonalities 
                : ['No obvious commonalities found - but that\'s what makes connections interesting!'],
            differences: comparison.differences || []
        };
    } catch (error) {
        console.error('LLM comparison error:', error);
        // Fallback to basic comparison if LLM fails
        return {
            commonalities: ['Unable to analyze profiles at the moment. Please try again!'],
            differences: []
        };
    }
}
