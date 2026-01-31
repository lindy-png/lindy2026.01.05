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
    
    // Check for required API keys
    if (!process.env.APIFY_API_TOKEN) {
        console.error('APIFY_API_TOKEN is not set');
        return res.status(500).json({ error: 'Server configuration error: Apify API token missing' });
    }
    
    if (!process.env.ANTHROPIC_API_KEY) {
        console.error('ANTHROPIC_API_KEY is not set');
        return res.status(500).json({ error: 'Server configuration error: Anthropic API key missing' });
    }
    
    try {
        let profileData;
        
        // Determine if LinkedIn or Twitter
        if (url.includes('linkedin.com')) {
            console.log('Scraping LinkedIn profile:', url);
            profileData = await scrapeLinkedIn(url);
            console.log('LinkedIn profile scraped:', profileData.name || 'Unknown');
        } else if (url.includes('twitter.com') || url.includes('x.com')) {
            console.log('Scraping Twitter profile:', url);
            profileData = await scrapeTwitter(url);
            console.log('Twitter profile scraped:', profileData.name || 'Unknown');
        } else {
            return res.status(400).json({ error: 'Please provide a LinkedIn or Twitter URL' });
        }
        
        // Compare profiles using LLM
        console.log('Comparing profiles with Anthropic...');
        console.log('User profile data:', JSON.stringify(profileData, null, 2));
        const comparison = await compareProfiles(profileData, lindyProfile);
        console.log('Comparison complete:', comparison.points?.length || 0, 'points found');
        console.log('Comparison result:', JSON.stringify(comparison, null, 2));
        
        // Ensure we always return points
        if (!comparison.points || comparison.points.length === 0) {
            console.error('WARNING: No points in comparison result!');
            comparison.points = ['Unable to generate comparison at this time. Please try again.'];
        }
        
        res.json({
            points: comparison.points
        });
    } catch (error) {
        console.error('Error in compare handler:', error);
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
        // Validate we have some profile data
        if (!userProfile || (!userProfile.name && !userProfile.headline && !userProfile.summary)) {
            console.error('Invalid user profile data:', userProfile);
            return {
                points: ['Unable to extract profile information. Please ensure the URL is correct and try again.']
            };
        }
        
        // Format profiles for LLM
        const userProfileText = `
Name: ${userProfile.name || 'Unknown'}
Headline: ${userProfile.headline || ''}
Location: ${userProfile.location || ''}
Skills: ${(userProfile.skills || []).join(', ') || 'Not specified'}
Experience: ${(userProfile.experiences || []).map(e => `${e.title || ''} at ${e.company || ''}`).join('; ') || 'Not specified'}
Summary: ${userProfile.summary || userProfile.bio || userProfile.tweets || 'Not specified'}
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

        const prompt = `You are analyzing two professional profiles to find meaningful connections. Be insightful, specific, and conversational.

User Profile:
${userProfileText}

Lindy's Profile:
${lindyProfileText}

Analyze these profiles and provide EXACTLY 3-4 bullet points that highlight either:
- Common ground (shared skills, experiences, interests, industry, location, career paths, values, etc.)
- OR interesting contrasting differences that could spark conversation

Prioritize commonalities if they exist. If there are no clear commonalities, focus on interesting differences that show complementary perspectives or conversation starters.

Be specific and actionable. Don't say "both in tech" - say "both building AI products" or "both in enterprise SaaS sales".

Format your response as JSON with a single "points" array containing exactly 3-4 items:
{
  "points": ["bullet point 1", "bullet point 2", "bullet point 3", "bullet point 4"]
}

Each point should be a complete, standalone sentence that's insightful and specific.`;

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
            // Fallback: try to extract bullet points from text
            console.error('Failed to parse LLM JSON:', parseError, responseText);
            
            // Look for bullet points or numbered list
            const bulletMatches = responseText.match(/(?:^|\n)[•\-\*]\s*(.+?)(?=\n|$)/g);
            const numberedMatches = responseText.match(/(?:^|\n)\d+[\.\)]\s*(.+?)(?=\n|$)/g);
            
            let points = [];
            if (bulletMatches) {
                points = bulletMatches.map(m => m.replace(/^[\n\s]*[•\-\*]\s*/, '').trim()).filter(p => p);
            } else if (numberedMatches) {
                points = numberedMatches.map(m => m.replace(/^[\n\s]*\d+[\.\)]\s*/, '').trim()).filter(p => p);
            }
            
            // If we found points, use them; otherwise create fallback
            if (points.length > 0) {
                comparison = { points: points.slice(0, 4) }; // Limit to 4
            } else {
                // Try to extract from "points" array in text
                const pointsMatch = responseText.match(/points?[:\-]?\s*\[?([^\]]+)\]?/i);
                if (pointsMatch) {
                    points = pointsMatch[1].split(',').map(s => s.trim().replace(/["']/g, '')).filter(s => s);
                    comparison = { points: points.slice(0, 4) };
                } else {
                    throw new Error('Could not extract points from response');
                }
            }
        }

        // Ensure we have 3-4 points
        let points = comparison.points || [];
        if (points.length === 0) {
            console.error('No points found in comparison, response was:', responseText);
            // Try to generate a fallback based on available data
            points = [
                'Both profiles are being analyzed for connections',
                'Looking for shared professional experiences or interests',
                'Exploring potential conversation starters'
            ];
        } else if (points.length > 4) {
            points = points.slice(0, 4);
        }

        console.log('Returning points:', points);
        return {
            points: points
        };
    } catch (error) {
        console.error('LLM comparison error:', error);
        // Fallback to basic comparison if LLM fails
        return {
            points: ['Unable to analyze profiles at the moment. Please try again!']
        };
    }
}
