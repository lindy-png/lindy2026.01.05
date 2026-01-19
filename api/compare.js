import { ApifyClient } from 'apify-client';

// Initialize Apify client
const client = new ApifyClient({
    token: process.env.APIFY_API_TOKEN
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
        
        // Compare profiles
        const comparison = compareProfiles(profileData, lindyProfile);
        
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

function compareProfiles(userProfile, lindyProfile) {
    const commonalities = [];
    const differences = [];
    
    // Compare skills
    if (userProfile.skills && userProfile.skills.length > 0) {
        const commonSkills = userProfile.skills.filter(skill => {
            const skillLower = skill.toLowerCase();
            return lindyProfile.skills.some(lindySkill => {
                const lindySkillLower = lindySkill.toLowerCase();
                return skillLower.includes(lindySkillLower) || 
                       lindySkillLower.includes(skillLower) ||
                       skillLower === lindySkillLower;
            });
        });
        
        if (commonSkills.length > 0) {
            commonalities.push(`Shared skills: ${commonSkills.slice(0, 5).join(', ')}${commonSkills.length > 5 ? '...' : ''}`);
        }
    }
    
    // Compare location
    if (userProfile.location) {
        const userLocation = userProfile.location.toLowerCase();
        if (userLocation.includes('san francisco') || userLocation.includes('sf') || userLocation.includes('bay area')) {
            commonalities.push('Both based in San Francisco');
        } else {
            differences.push(`Location: ${userProfile.location} (Lindy is in SF)`);
        }
    }
    
    // Compare industry/companies
    if (userProfile.experiences && userProfile.experiences.length > 0) {
        const userCompanies = userProfile.experiences.map(e => (e.company || '').toLowerCase());
        const commonCompanies = userCompanies.filter(company =>
            lindyProfile.companies.some(lindyCompany =>
                company.includes(lindyCompany.toLowerCase()) ||
                lindyCompany.toLowerCase().includes(company)
            )
        );
        
        if (commonCompanies.length > 0) {
            commonalities.push(`Shared companies/industries: ${commonCompanies.join(', ')}`);
        }
    }
    
    // Extract interests from bio/tweets/summary
    const userText = (userProfile.bio || userProfile.summary || userProfile.tweets || userProfile.headline || '').toLowerCase();
    const lindyInterests = lindyProfile.interests.map(i => i.toLowerCase());
    const mentionedInterests = lindyInterests.filter(interest => userText.includes(interest));
    
    if (mentionedInterests.length > 0) {
        commonalities.push(`Shared interests: ${mentionedInterests.map(i => i.charAt(0).toUpperCase() + i.slice(1)).join(', ')}`);
    }
    
    // Check for AI/SaaS industry keywords
    const industryKeywords = ['ai', 'artificial intelligence', 'saas', 'software', 'tech', 'technology', 'startup'];
    const hasIndustryMatch = industryKeywords.some(keyword => userText.includes(keyword));
    if (hasIndustryMatch) {
        commonalities.push('Both in tech/AI industry');
    }
    
    return {
        commonalities: commonalities.length > 0 ? commonalities : ['No obvious commonalities found - but that\'s what makes connections interesting!'],
        differences: differences
    };
}
